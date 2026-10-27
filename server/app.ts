import { existsSync } from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import {
  COACH_MODELS,
  coachModelLabel,
  isVipModel,
  type BotMoveResponse,
  type BotRating,
  type MoveGrade,
  type PositionEval,
  type SessionResponse,
  type StatusResponse,
} from "../shared/types";
import { CachedAnalyzer } from "./analysis/cache";
import { AuthError, type Auth } from "./auth/auth";
import { SESSION_COOKIE, SESSION_TTL_MS, type SessionUser } from "./auth/session";
import { gradeMove, type Analyzer } from "./analysis/grade";
import { opponent, toMoveInput } from "./analysis/motifs";
import { evaluatePosition } from "./analysis/position";
import { MAX_PLAYABLE_RATING, MIN_PLAYABLE_RATING } from "./bot/strength";
import { CoachError, type AskSubject, type Coach } from "./coach";

interface EngineConnection {
  warmUp(): Promise<void>;
}

export interface AppDeps {
  /** Engine connection used for grading. */
  analyzer: Analyzer & EngineConnection;
  /** A separate connection for bot moves, so the bot never waits behind grading. */
  bot: EngineConnection & { move(fen: string, rating: BotRating): Promise<string | null> };
  coach: Pick<Coach, "configured" | "defaultModel" | "explain" | "ask">;
  /** Sign-in. Every /api route except the /api/auth ones needs a signed-in session. */
  auth: Pick<Auth, "signIn" | "sessionUser">;
  analysisDepth: number;
  /** How many grading searches `analyzer` runs at once (GRADING_ENGINES); reviews grade that many moves at a time. */
  gradingEngines?: number;
  /** Built client to serve, if it exists. */
  distDir?: string;
  /** The commit the image was built from (APP_VERSION), reported by /api/health. */
  version?: string;
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

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new BadRequest(
      result.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "),
    );
  }
  return result.data;
}

export function createApp({
  analyzer: engine,
  bot,
  coach,
  auth,
  analysisDepth,
  gradingEngines = 1,
  distDir,
  version = "dev",
}: AppDeps) {
  // The evaluation bar and grading often ask about the same position, so analyses are cached.
  const analyzer = new CachedAnalyzer(engine);
  const coachModels = [...new Set<string>([coach.defaultModel, ...COACH_MODELS.map((m) => m.id)])];
  /** The default model for an account: COACH_MODEL, unless only VIP accounts may use it. */
  const defaultModelFor = (user: SessionUser) =>
    user.vip || !isVipModel(coach.defaultModel) ? coach.defaultModel : COACH_MODELS.find((m) => !m.vip)!.id;
  /** The model a coach request uses. Only VIP accounts may use VIP models such as Opus. */
  const modelFor = (requested: string | undefined, user: SessionUser) => {
    if (!requested) return defaultModelFor(user);
    if (isVipModel(requested) && !user.vip) {
      throw new AuthError(403, `${coachModelLabel(requested)} is only for VIP accounts. Pick another model.`);
    }
    return requested;
  };
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
  // Azure Container Apps puts one proxy in front of the app: trust it for the client's IP
  // (used to limit sign-in attempts) and for HTTPS (so the session cookie is marked Secure).
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "200kb" }));

  const cookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, path: "/" });

  app.post("/api/auth/login", async (req, res) => {
    const body = parse(
      z.object({
        username: z.string().trim().min(1, "Enter your username").max(64),
        password: z.string().min(1, "Enter your password").max(200),
      }),
      req.body,
    );
    const session = await auth.signIn(body.username, body.password, req.ip ?? "unknown");
    res.cookie(SESSION_COOKIE, session.token, { ...cookieOptions(req.secure), maxAge: SESSION_TTL_MS });
    res.json({ username: session.username, vip: session.vip } satisfies SessionResponse);
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions(req.secure));
    res.json({ ok: true });
  });

  app.get("/api/auth/me", (req, res) => {
    const user = auth.sessionUser(req.headers.cookie);
    if (!user) throw new AuthError(401, "Sign in first");
    res.json({ username: user.username, vip: user.vip } satisfies SessionResponse);
  });

  // Public, and touches neither the engine nor the database: the deploy job polls it until the
  // new build answers.
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, version });
  });

  // The session cookie carries the account's VIP flag, so routes check it without the database.
  app.use("/api", (req, res, next) => {
    const user = auth.sessionUser(req.headers.cookie);
    if (!user) throw new AuthError(401, "Sign in first");
    res.locals.user = user;
    next();
  });
  const userOf = (res: Response): SessionUser => res.locals.user as SessionUser;

  app.get("/api/status", (_req, res) => {
    const status: StatusResponse = {
      engine: { ready: !engineError(), error: engineError(), gradingEngines },
      coach: {
        ready: coach.configured,
        defaultModel: defaultModelFor(userOf(res)),
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
    // nextGraded: the client grades the next move too (reviewing a whole game).
    const body = parse(z.object({ fen, uci, nextGraded: z.boolean().default(false) }), req.body);
    try {
      new Chess(body.fen).move(toMoveInput(body.uci));
    } catch {
      throw new BadRequest("Illegal move for this position");
    }
    const grade = await withEngine("analyzer", () =>
      gradeMove(analyzer, body.fen, body.uci, analysisDepth, { nextGraded: body.nextGraded }),
    );
    res.json(grade satisfies MoveGrade);
  });

  app.post("/api/eval", async (req, res) => {
    const body = parse(z.object({ fen }), req.body);
    const result = await withEngine("analyzer", () => evaluatePosition(analyzer, body.fen, analysisDepth));
    res.json(result satisfies PositionEval);
  });

  const grade = z.custom<MoveGrade>((v) => typeof v === "object" && v !== null, "Required");
  const explainBody = z.object({
    grade,
    history: z.array(z.string()),
    model: z
      .string()
      .refine((id) => coachModels.includes(id), `Must be one of ${coachModels.join(", ")}`)
      .optional(),
    perspective: z.enum(["mine", "opponent"]).default("mine"),
    opening: z
      .object({
        studying: z.string().max(200),
        reached: z.string().max(200).nullable(),
        bookMove: z.boolean(),
        bookMoves: z.array(z.string().max(10)).max(60),
        line: z.array(z.string().max(10)).max(60),
      })
      .optional(),
  });
  // The coach's try_moves tool asks the grading connection for the best line in a position.
  const lineEngine = (position: string) =>
    withEngine("analyzer", () => analyzer.analyze(position, { multipv: 1, depth: analysisDepth }));

  app.post("/api/explain", async (req, res) => {
    const body = parse(explainBody, req.body);
    const model = modelFor(body.model, userOf(res));
    res.json(
      await coach.explain(body.grade, body.history, {
        model,
        perspective: body.perspective,
        engine: lineEngine,
        opening: body.opening,
      }),
    );
  });

  // A question about a move (its grade), with or without its explanation, or about a position no
  // move has led to yet (fen), such as the start of the game.
  const askBody = explainBody
    .extend({
      grade: grade.optional(),
      fen: fen.optional(),
      explanation: z.object({ summary: z.string(), steps: z.array(z.string()).max(10), lesson: z.string() }).optional(),
      thread: z
        .array(z.object({ question: z.string().max(500), answer: z.string(), steps: z.array(z.string()).max(10) }))
        .max(20)
        .default([]),
      question: z.string().trim().min(1, "Type a question").max(500, "Keep the question under 500 characters"),
    })
    .superRefine((body, ctx) => {
      if (!body.grade && !body.fen) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["grade"], message: "Required" });
    });

  app.post("/api/ask", async (req, res) => {
    const body = parse(askBody, req.body);
    const model = modelFor(body.model, userOf(res));
    let subject: AskSubject;
    if (body.grade) {
      subject = { grade: body.grade };
    } else {
      const position = body.fen!;
      if (new Chess(position).isGameOver()) throw new BadRequest("The game is over in this position");
      const analysis = await withEngine("analyzer", () => analyzer.analyze(position, { multipv: 3, depth: analysisDepth }));
      subject = { fen: position, analysis };
    }
    res.json(
      await coach.ask(subject, body.history, body.explanation ?? null, body.thread, body.question, {
        model,
        perspective: body.perspective,
        engine: lineEngine,
        opening: body.opening,
      }),
    );
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
        : err instanceof AuthError
          ? err.status
          : err instanceof CoachError
            ? 503
            : typeof given === "number" && given >= 400 && given < 500
              ? given
              : 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 400 && err instanceof SyntaxError ? "Invalid JSON body" : message });
  });

  const checkEngine = () =>
    Promise.all([withEngine("analyzer", () => engine.warmUp()), withEngine("bot", () => bot.warmUp())]);
  return { app, checkEngine, engineError };
}

function engineHelp(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/ENOENT|connection closed|docker/i.test(message)) {
    return `Can't reach the Stockfish engine (${message}). Make sure Docker Desktop is running and the image is built with "npm run engine:build".`;
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(message)) {
    return `Can't reach the Stockfish engine at ENGINE_URL (${message}). Check that the engine container is running and the URL is right.`;
  }
  return message;
}
