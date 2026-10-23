import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { EngineLine, Explanation, MoveGrade } from "../shared/types";
import { createApp, type AppDeps } from "./app";
import { CoachError } from "./coach";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// White to move; Qf7 stalemates the black king on h8.
const STALEMATE_SETUP = "7k/4Q3/6K1/8/8/8/8/8 w - - 0 1";
// Fool's mate: White is checkmated.
const MATED = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

const EXPLANATION: Explanation = {
  verdict: "Good move.",
  why: "It takes the center.",
  betterMove: "This was the top choice.",
  opponentIdea: "Black will challenge the center.",
  lesson: "Occupy the center early.",
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

function fakeCoach(overrides: Partial<AppDeps["coach"]> = {}): AppDeps["coach"] {
  return { configured: true, model: "test-model", explain: async () => EXPLANATION, ...overrides };
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
      body: { engine: { ready: true }, coach: { ready: true, model: "test-model" } },
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
