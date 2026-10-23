import path from "node:path";
import { z } from "zod";
import { createApp } from "./app";
import { Bot } from "./bot/bot";
import { Coach } from "./coach";
import { McpStockfishEngine } from "./engine/mcpEngine";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the real environment.
}

const PORT = Number(process.env.API_PORT ?? 3001);
const ANALYSIS_DEPTH = Number(process.env.ANALYSIS_DEPTH ?? 16);
const COACH_EFFORT = z.enum(["low", "medium", "high"]).catch("medium").parse(process.env.COACH_EFFORT);

// mcp-stockfish answers one request at a time, so grading and the bot each get their own
// server (and Docker container). Otherwise the bot's reply waits behind the grade.
const image = process.env.STOCKFISH_IMAGE ?? "chessbuddy/mcp-stockfish";
const analyzer = new McpStockfishEngine(image);
const botEngine = new McpStockfishEngine(image);
const bot = new Bot(botEngine);
const coach = new Coach(process.env.COACH_MODEL ?? "claude-sonnet-5-5", COACH_EFFORT);
const { app, checkEngine, engineError } = createApp({
  analyzer,
  bot,
  coach,
  analysisDepth: ANALYSIS_DEPTH,
  distDir: path.resolve("dist"),
});

app.listen(PORT, () => {
  console.log(`ChessBuddy server on http://localhost:${PORT}`);
  console.log(coach.configured ? `Coach: ${coach.defaultModel} (default)` : "Coach: no ANTHROPIC_API_KEY yet (Explain is disabled)");
  checkEngine().then(
    () => console.log("Engine: ready"),
    () => console.error(`Engine: ${engineError()}`),
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    Promise.allSettled([analyzer.close(), botEngine.close()]).finally(() => process.exit(0));
  });
}
