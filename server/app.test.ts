import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { CoachReply, EngineLine, Explanation, MoveGrade } from "../shared/types";
import { createApp, type AppDeps } from "./app";
import { CoachError } from "./coach";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// White to move; Qf7 stalemates the black king on h8.
const STALEMATE_SETUP = "7k/4Q3/6K1/8/8/8/8/8 w - - 0 1";
// Fool's mate: White is checkmated.
const MATED = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

const EXPLANATION: Explanation = {
  summary: "Good move.",
  steps: [
    {
      caption: "1. e4 takes the center.",
      fen: START,
      moves: [{ uci: "e2e4", san: "e4" }],
      arrows: [],
      marks: [],
      evaluation: { score: { cp: 30 } },
    },
  ],
  lesson: "Occupy the center early.",
  model: "test-model",
};

function fakeAnalyzer(overrides: Partial<AppDeps["analyzer"]> = {}): AppDeps["analyzer"] {
  const whiteLine: EngineLine = { score: { cp: 30 }, pv: ["e2e4", "e7e5"] };
  const blackLine: EngineLine = { score: { cp: -30 }, pv: ["e7e5", "g1f3"] };
  return {
    analyze: async (fen) => {
      if (fen === STALEMATE_SETUP) return [{ score: { mate: 2 }, pv: ["g6f6"] }];
      return [fen.split(" ")[1] === "w" ? whiteLine : blackLine];
    },
    warmUp: async () => {},
    ...overrides,
  };
}

function fakeBot(overrides: Partial<AppDeps["bot"]> = {}): AppDeps["bot"] {
  return { move: async () => "e7e5", warmUp: async () => {}, ...overrides };
}

const unreachable = async (): Promise<never> => {
  throw new Error("spawn docker ENOENT");
};

const REPLY: CoachReply = { answer: "1... c5 is fine too.", steps: [], model: "test-model" };

function fakeCoach(overrides: Partial<AppDeps["coach"]> = {}): AppDeps["coach"] {
  return {
    configured: true,
    defaultModel: "claude-sonnet-5-5",
    explain: async () => EXPLANATION,
    ask: async () => REPLY,
    ...overrides,
  };
}

let server: Server | undefined;

async function start(deps: Partial<AppDeps> = {}) {
  const { app } = createApp({ analyzer: fakeAnalyzer(), bot: fakeBot(), coach: fakeCoach(), analysisDepth: 10, ...deps });
  server = app.listen(0);
  await new Promise((resolve) => server!.once("listening", resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  return async (method: string, path: string, body?: unknown, raw?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: body !== undefined || raw !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: res.status, body: await res.json() };
  };
}

afterEach(() => {
  server?.close();
  server = undefined;
});

describe("GET /api/status", () => {
  it("reports engine and coach readiness", async () => {
    const call = await start();
    expect(await call("GET", "/api/status")).toEqual({
      status: 200,
      body: { engine: { ready: true }, coach: { ready: true, defaultModel: "claude-sonnet-5-5" } },
    });
  });

  it("tells the user to add a key when the coach is not configured", async () => {
    const call = await start({ coach: fakeCoach({ configured: false }) });
    const { body } = await call("GET", "/api/status");
    expect(body.coach.ready).toBe(false);
    expect(body.coach.error).toMatch(/ANTHROPIC_API_KEY/);
  });
});

describe("POST /api/bot-move", () => {
  it("returns the engine move in UCI and SAN", async () => {
    const call = await start();
    const after = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    expect(await call("POST", "/api/bot-move", { fen: after, rating: 1200 })).toEqual({
      status: 200,
      body: { uci: "e7e5", san: "e5" },
    });
  });

  it("passes the requested rating to the bot, including full strength", async () => {
    const seen: unknown[] = [];
    const call = await start({
      bot: fakeBot({
        move: async (_fen, rating) => {
          seen.push(rating);
          return "e7e5";
        },
      }),
    });
    const after = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    await call("POST", "/api/bot-move", { fen: after, rating: 800 });
    await call("POST", "/api/bot-move", { fen: after, rating: "max" });
    expect(seen).toEqual([800, "max"]);
  });

  it.each([[300], [2700], [1200.5], ["strong"]])("rejects the rating %j", async (bad) => {
    const call = await start();
    expect(await call("POST", "/api/bot-move", { fen: START, rating: bad })).toEqual({
      status: 400,
      body: { error: 'rating: Must be a rating from 400 to 2600, or "max"' },
    });
  });

  it("refuses to move in a finished game", async () => {
    const call = await start();
    expect(await call("POST", "/api/bot-move", { fen: MATED, rating: 1200 })).toEqual({
      status: 400,
      body: { error: "The game is over in this position" },
    });
  });
});

describe("POST /api/grade", () => {
  it("grades a legal move", async () => {
    const call = await start();
    const { status, body } = await call("POST", "/api/grade", { fen: START, uci: "e2e4" });
    expect(status).toBe(200);
    expect((body as MoveGrade).played).toEqual({ uci: "e2e4", san: "e4" });
    expect((body as MoveGrade).classification).toBe("best");
  });

  it("rejects an illegal move", async () => {
    const call = await start();
    expect(await call("POST", "/api/grade", { fen: START, uci: "e2e5" })).toEqual({
      status: 400,
      body: { error: "Illegal move for this position" },
    });
  });

  it("rejects a position where the side not to move is in check", async () => {
    const call = await start();
    const illegal = "7k/8/5Q2/6K1/8/8/8/8 w - - 0 1";
    expect(await call("POST", "/api/grade", { fen: illegal, uci: "g5g6" })).toEqual({
      status: 400,
      body: { error: "fen: Illegal position: the side not to move is in check" },
    });
  });

  it("lists every missing field", async () => {
    const call = await start();
    expect(await call("POST", "/api/grade", {})).toEqual({
      status: 400,
      body: { error: "fen: Required; uci: Required" },
    });
  });

  it("grades a stalemating move as a draw without analysing the final position", async () => {
    const call = await start();
    const { status, body } = await call("POST", "/api/grade", { fen: STALEMATE_SETUP, uci: "e7f7" });
    expect(status).toBe(200);
    expect((body as MoveGrade).evalAfter).toBe("0.00");
    expect((body as MoveGrade).classification).toBe("blunder");
    expect((body as MoveGrade).motifs).toContain("Your move ends the game in a draw.");
  });

  it("explains how to fix an unreachable engine and reports it in the status", async () => {
    const call = await start({ analyzer: fakeAnalyzer({ analyze: unreachable }) });
    const { status, body } = await call("POST", "/api/grade", { fen: START, uci: "e2e4" });
    expect(status).toBe(500);
    expect(body.error).toMatch(/Docker Desktop is running/);
    expect((await call("GET", "/api/status")).body.engine.ready).toBe(false);
  });
});

describe("separate engine connections", () => {
  const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

  it("keeps grading when only the bot connection is down", async () => {
    const call = await start({ bot: fakeBot({ move: unreachable }) });
    expect((await call("POST", "/api/bot-move", { fen: AFTER_E4, rating: 1200 })).status).toBe(500);
    expect((await call("POST", "/api/grade", { fen: START, uci: "e2e4" })).status).toBe(200);
  });

  it("keeps the bot playing when only the grading connection is down", async () => {
    const call = await start({ analyzer: fakeAnalyzer({ analyze: unreachable }) });
    expect((await call("POST", "/api/grade", { fen: START, uci: "e2e4" })).status).toBe(500);
    expect((await call("POST", "/api/bot-move", { fen: AFTER_E4, rating: 1200 })).status).toBe(200);
  });

  it("reports the engine as unavailable while either connection is failing", async () => {
    const call = await start({ bot: fakeBot({ move: unreachable }) });
    await call("POST", "/api/bot-move", { fen: AFTER_E4, rating: 1200 });
    // A successful grade must not hide the bot connection's failure.
    await call("POST", "/api/grade", { fen: START, uci: "e2e4" });
    const { body } = await call("GET", "/api/status");
    expect(body.engine.ready).toBe(false);
    expect(body.engine.error).toMatch(/Docker Desktop is running/);
  });
});

describe("POST /api/explain", () => {
  it("returns the coach's explanation", async () => {
    const call = await start();
    expect(await call("POST", "/api/explain", { grade: {}, history: [] })).toEqual({ status: 200, body: EXPLANATION });
  });

  it("returns 503 with the coach's message when the coach fails", async () => {
    const call = await start({
      coach: fakeCoach({
        explain: async () => {
          throw new CoachError("No Anthropic API key found.");
        },
      }),
    });
    expect(await call("POST", "/api/explain", { grade: {}, history: [] })).toEqual({
      status: 503,
      body: { error: "No Anthropic API key found." },
    });
  });

  it("names the missing grade", async () => {
    const call = await start();
    expect(await call("POST", "/api/explain", { history: [] })).toEqual({
      status: 400,
      body: { error: "grade: Required" },
    });
  });

  it("passes the chosen model and perspective to the coach, defaulting to the player's own move", async () => {
    const seen: unknown[] = [];
    const call = await start({
      coach: fakeCoach({
        explain: async (_grade, _history, { model, perspective, engine }) => {
          seen.push({ model, perspective, engine: typeof engine });
          return EXPLANATION;
        },
      }),
    });
    await call("POST", "/api/explain", { grade: {}, history: [] });
    await call("POST", "/api/explain", { grade: {}, history: [], model: "claude-haiku-5-5", perspective: "opponent" });
    expect(seen).toEqual([
      { model: "claude-sonnet-5-5", perspective: "mine", engine: "function" },
      { model: "claude-haiku-5-5", perspective: "opponent", engine: "function" },
    ]);
  });

  it("passes what the coach needs to know about the opening being learned", async () => {
    const seen: unknown[] = [];
    const call = await start({
      coach: fakeCoach({
        explain: async (_grade, _history, { opening }) => {
          seen.push(opening);
          return EXPLANATION;
        },
      }),
    });
    const opening = { studying: "Sicilian Defense", reached: "Sicilian Defense", bookMove: true, bookMoves: ["c5"], line: ["c5"] };
    await call("POST", "/api/explain", { grade: {}, history: [], opening });
    await call("POST", "/api/explain", { grade: {}, history: [] });
    expect(seen).toEqual([opening, undefined]);
  });

  it("gives the coach an engine that searches one line through the shared cache", async () => {
    const searches: unknown[] = [];
    let engine: ((fen: string) => Promise<EngineLine[]>) | undefined;
    const call = await start({
      analyzer: fakeAnalyzer({
        analyze: async (_fen, options) => {
          searches.push(options);
          return [{ score: { cp: 30 }, pv: ["e2e4"] }];
        },
      }),
      coach: fakeCoach({
        explain: async (_grade, _history, options) => {
          engine = options.engine;
          return EXPLANATION;
        },
      }),
    });
    await call("POST", "/api/explain", { grade: {}, history: [] });
    expect(await engine!(START)).toEqual([{ score: { cp: 30 }, pv: ["e2e4"] }]);
    expect(searches).toEqual([{ multipv: 1, depth: 10 }]);
  });

  it("rejects a model that isn't offered", async () => {
    const call = await start();
    const { status, body } = await call("POST", "/api/explain", { grade: {}, history: [], model: "gpt-4" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/^model: Must be one of claude-sonnet-5-5, claude-opus-5-5, claude-haiku-5-5/);
  });
});

describe("POST /api/ask", () => {
  const EXPLAINED = { summary: "Good move.", steps: ["1. e4 takes the center."], lesson: "Occupy the center early." };

  it("passes the question, the explanation and the earlier questions to the coach", async () => {
    const seen: unknown[] = [];
    const call = await start({
      coach: fakeCoach({
        ask: async (_grade, history, explanation, thread, question, { model }) => {
          seen.push({ history, explanation, thread, question, model });
          return REPLY;
        },
      }),
    });
    const thread = [{ question: "Why not d4?", answer: "Also good.", steps: [] }];
    const result = await call("POST", "/api/ask", {
      grade: {},
      history: ["e4"],
      explanation: EXPLAINED,
      thread,
      question: "  What about c5?  ",
    });
    expect(result).toEqual({ status: 200, body: REPLY });
    expect(seen).toEqual([
      { history: ["e4"], explanation: EXPLAINED, thread, question: "What about c5?", model: "claude-sonnet-5-5" },
    ]);
  });

  it("asks for a question when it is empty", async () => {
    const call = await start();
    const { status, body } = await call("POST", "/api/ask", { grade: {}, history: [], explanation: EXPLAINED, question: " " });
    expect(status).toBe(400);
    expect(body.error).toBe("question: Type a question");
  });

  it("needs the explanation being asked about", async () => {
    const call = await start();
    const { status, body } = await call("POST", "/api/ask", { grade: {}, history: [], question: "Why?" });
    expect(status).toBe(400);
    expect(body.error).toBe("explanation: Required");
  });
});

describe("POST /api/eval", () => {
  const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

  it("returns the evaluation from White's side", async () => {
    const call = await start();
    // The fake engine scores Black-to-move positions at -30 for Black.
    expect(await call("POST", "/api/eval", { fen: AFTER_E4 })).toEqual({ status: 200, body: { score: { cp: 30 } } });
  });

  it("reports a finished game", async () => {
    const call = await start();
    expect(await call("POST", "/api/eval", { fen: MATED })).toEqual({
      status: 200,
      body: { score: { mate: 0 }, outcome: "black" },
    });
  });

  it("searches each position once and reuses the result for grading", async () => {
    const analyzed: string[] = [];
    const base = fakeAnalyzer();
    const call = await start({
      analyzer: fakeAnalyzer({
        analyze: async (fen, options) => {
          analyzed.push(fen);
          return base.analyze(fen, options);
        },
      }),
    });
    await call("POST", "/api/eval", { fen: AFTER_E4 });
    await call("POST", "/api/eval", { fen: AFTER_E4 });
    await call("POST", "/api/grade", { fen: AFTER_E4, uci: "e7e5" });
    // One search for the position itself, one for the position after the graded move.
    expect(analyzed.filter((f) => f === AFTER_E4)).toHaveLength(1);
  });
});

describe("request handling", () => {
  it("returns 404 JSON for unknown API routes", async () => {
    const call = await start();
    expect(await call("GET", "/api/nope")).toEqual({ status: 404, body: { error: "Not found" } });
  });

  it("returns 400 for malformed JSON", async () => {
    const call = await start();
    expect(await call("POST", "/api/grade", undefined, "{not json")).toEqual({
      status: 400,
      body: { error: "Invalid JSON body" },
    });
  });

  it("returns 413 for an oversized body", async () => {
    const call = await start();
    const { status } = await call("POST", "/api/grade", { fen: START, uci: "e2e4", pad: "x".repeat(300_000) });
    expect(status).toBe(413);
  });
});
