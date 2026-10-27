import { randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { createApp } from "./app";
import { Auth } from "./auth/auth";
import { SqlUserStore } from "./auth/sqlUsers";
import { MemoryUserStore, ownerAccount, type UserStore } from "./auth/users";
import { Bot } from "./bot/bot";
import { Coach } from "./coach";
import { McpStockfishEngine, type EngineTarget } from "./engine/mcpEngine";
import { LichessExplorer } from "./explorer";
import { EnginePool, gradingEngineCount, MAX_GRADING_ENGINES } from "./engine/pool";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

const PORT = Number(process.env.API_PORT ?? 3001);
const ANALYSIS_DEPTH = Number(process.env.ANALYSIS_DEPTH ?? 16);
const COACH_EFFORT = z.enum(["low", "medium", "high"]).catch("medium").parse(process.env.COACH_EFFORT);

// mcp-stockfish answers one request at a time, so grading and the bot each get their own
// connections. Locally that's a Docker container each; behind ENGINE_URL the engine container's
// gateway hands each request to one of its mcp-stockfish processes. Otherwise the bot's reply
// waits behind the grade. GRADING_ENGINES connections grade side by side (1 by default), and a
// reviewed game is graded that many moves at a time.
const engineTarget: EngineTarget = process.env.ENGINE_URL
  ? { url: process.env.ENGINE_URL, token: process.env.ENGINE_TOKEN || undefined }
  : { image: process.env.STOCKFISH_IMAGE ?? "chessbuddy/mcp-stockfish" };
let gradingEngines = gradingEngineCount(process.env.GRADING_ENGINES);
if (gradingEngines === null) {
  console.warn(`GRADING_ENGINES must be a whole number from 1 to ${MAX_GRADING_ENGINES}: using 1.`);
  gradingEngines = 1;
}
const analyzer = new EnginePool(Array.from({ length: gradingEngines }, () => new McpStockfishEngine(engineTarget)));
const botEngine = new McpStockfishEngine(engineTarget);
const bot = new Bot(botEngine);
const coach = new Coach(process.env.COACH_MODEL ?? "claude-sonnet-5-5", COACH_EFFORT);
const explorer = new LichessExplorer(process.env.LICHESS_TOKEN?.trim() || undefined);

// The owner signs in against this hash, never the database; everyone else is looked up in Azure SQL.
const owner = ownerAccount(process.env.OWNER_PASSWORD_HASH);
const users: UserStore = process.env.SQL_CONNECTION_STRING
  ? new SqlUserStore(process.env.SQL_CONNECTION_STRING)
  : new MemoryUserStore();
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  sessionSecret = randomBytes(32).toString("base64url");
  console.warn("SESSION_SECRET isn't set: using a random one, so restarting the server signs everyone out.");
}
const auth = new Auth(users, sessionSecret, { owner });

const { app, checkEngine, engineError } = createApp({
  analyzer,
  bot,
  coach,
  explorer,
  auth,
  analysisDepth: ANALYSIS_DEPTH,
  gradingEngines,
  distDir: path.resolve("dist"),
  version: process.env.APP_VERSION,
});

// Express 5 also calls this when listening fails (for example, the port is taken).
app.listen(PORT, (error?: Error) => {
  if (error) {
    console.error(`Couldn't listen on port ${PORT}: ${error.message}. Set API_PORT in .env to use another port.`);
    process.exit(1);
  }
  console.log(`ChessBuddy server on http://localhost:${PORT}`);
  console.log(coach.configured ? `Coach: ${coach.defaultModel} (default)` : "Coach: no ANTHROPIC_API_KEY yet (Explain is disabled)");
  console.log(
    explorer.configured
      ? "Opening explorer: Lichess, with LICHESS_TOKEN"
      : "Opening explorer: no LICHESS_TOKEN yet (Learn openings shows no move percentages)",
  );
  console.log(
    process.env.SQL_CONNECTION_STRING
      ? "Accounts: Azure SQL (connects on the first sign-in of an account other than the owner)"
      : "Accounts: the owner only (set SQL_CONNECTION_STRING to use Azure SQL for other accounts)",
  );
  console.log(
    process.env.OWNER_PASSWORD_HASH?.trim()
      ? `Owner ${owner.username}: password hash from OWNER_PASSWORD_HASH`
      : `Owner ${owner.username}: default password hash from the code (set OWNER_PASSWORD_HASH to change the password)`,
  );
  console.log(
    `${"url" in engineTarget ? `Engine: ${engineTarget.url}` : `Engine: Docker image ${engineTarget.image}`}, ${gradingEngines} grading ${gradingEngines === 1 ? "engine" : "engines"} and 1 for the bot`,
  );
  checkEngine().then(
    () => console.log("Engine: ready"),
    () => console.error(`Engine: ${engineError()}`),
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    Promise.allSettled([analyzer.close(), botEngine.close(), users.close?.()]).finally(() => process.exit(0));
  });
}
