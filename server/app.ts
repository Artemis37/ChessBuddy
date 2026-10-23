import { existsSync } from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { BotMoveResponse, BotRating, MoveGrade, StatusResponse } from "../shared/types";
import { gradeMove, type Analyzer } from "./analysis/grade";
import { opponent, toMoveInput } from "./analysis/motifs";
import { MAX_PLAYABLE_RATING, MIN_PLAYABLE_RATING } from "./bot/strength";
import { CoachError, type Coach } from "./coach";

interface EngineConnection {
  warmUp(): Promise<void>;
}

export interface AppDeps {
  /** Engine connection used for grading. */
  analyzer: Analyzer & EngineConnection;
  /** A separate connection for bot moves, so the bot never waits behind grading. */
  bot: EngineConnection & { move(fen: string, rating: BotRating): Promise<string | null> };
  coach: Pick<Coach, "configured" | "model" | "explain">;
  analysisDepth: number;
  /** Built client to serve, if it exists. */
  distDir?: string;
}

class BadRequest extends Error {}

const fen = z.string().superRefine((value, ctx) => {
  const problem = positionProblem(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});
const uci = z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Invalid UCI move");
const ratingMessage = `Must be a rating from ${MIN_PLAYABLE_RATING} to ${MAX_PLAYABLE_RATING}, or "max"`;
const rating: z.ZodType<BotRating> = z.union(
  [
    z.literal("max"),
    z
      .number()
      .int(ratingMessage)
      .min(MIN_PLAYABLE_RATING, ratingMessage)
      .max(MAX_PLAYABLE_RATING, ratingMessage),
  ],
  { errorMap: () => ({ message: ratingMessage }) },
);

/** Stockfish exits on illegal positions, so they are rejected before reaching it. */
function positionProblem(value: string): string | null {
  let chess: Chess;
  try {
    chess = new Chess(value);
  } catch {
    return "Invalid FEN";
  }
  const kings = chess.findPiece({ type: "k", color: opponent(chess.turn()) });
  if (kings.length !== 1 || chess.findPiece({ type: "k", color: chess.turn() }).length !== 1) {
    return "Illegal position: each side needs exactly one king";
  }
  if (chess.isAttacked(kings[0], chess.turn())) {
    return "Illegal position: the side not to move is in check";
  }
  return null;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new BadRequest(
      result.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "),
    );
  }
  return result.data;
}

export function createApp({ analyzer, bot, coach, analysisDepth, distDir }: AppDeps) {
  const engineErrors: Record<"analyzer" | "bot", string | undefined> = { analyzer: undefined, bot: undefined };
  const engineError = () => engineErrors.analyzer ?? engineErrors.bot;

  async function withEngine<T>(connection: keyof typeof engineErrors, task: () => Promise<T>): Promise<T> {
    try {
      const result = await task();
      engineErrors[connection] = undefined;
      return result;
    } catch (err) {
      const message = engineHelp(err);
      engineErrors[connection] = message;
      throw new Error(message);
    }
  }

  const app = express();
  app.use(express.json({ limit: "200kb" }));

  app.get("/api/status", (_req, res) => {
    const status: StatusResponse = {
      engine: { ready: !engineError(), error: engineError() },
      coach: {
        ready: coach.configured,
        model: coach.model,
        error: coach.configured ? undefined : "Add ANTHROPIC_API_KEY to .env and restart the server.",
      },
    };
    res.json(status);
  });

  app.post("/api/bot-move", async (req, res) => {
    const body = parse(z.object({ fen, rating }), req.body);
    if (new Chess(body.fen).isGameOver()) throw new BadRequest("The game is over in this position");
    const move = await withEngine("bot", () => bot.move(body.fen, body.rating));
    if (!move) throw new BadRequest("The bot has no legal move in this position");
    const san = new Chess(body.fen).move(toMoveInput(move)).san;
    res.json({ uci: move, san } satisfies BotMoveResponse);
  });

  app.post("/api/grade", async (req, res) => {
    const body = parse(z.object({ fen, uci }), req.body);
    try {
      new Chess(body.fen).move(toMoveInput(body.uci));
    } catch {
      throw new BadRequest("Illegal move for this position");
    }
    const grade = await withEngine("analyzer", () => gradeMove(analyzer, body.fen, body.uci, analysisDepth));
    res.json(grade satisfies MoveGrade);
  });

  app.post("/api/explain", async (req, res) => {
    const body = parse(
      z.object({
        grade: z.custom<MoveGrade>((v) => typeof v === "object" && v !== null, "Required"),
        history: z.array(z.string()),
      }),
      req.body,
    );
    res.json(await coach.explain(body.grade, body.history));
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  if (distDir && existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("/{*path}", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    // Body-parser errors (bad JSON, body too large) carry their own 4xx status.
    const given = (err as { status?: unknown }).status;
    const status =
      err instanceof BadRequest
        ? 400
        : err instanceof CoachError
          ? 503
          : typeof given === "number" && given >= 400 && given < 500
            ? given
            : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 400 && err instanceof SyntaxError ? "Invalid JSON body" : message });
  });

  const checkEngine = () =>
    Promise.all([withEngine("analyzer", () => analyzer.warmUp()), withEngine("bot", () => bot.warmUp())]);
  return { app, checkEngine, engineError };
}

function engineHelp(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/ENOENT|connection closed|docker/i.test(message)) {
    return `Can't reach the Stockfish engine (${message}). Make sure Docker Desktop is running and the image is built with "npm run engine:build".`;
  }
  return message;
}
