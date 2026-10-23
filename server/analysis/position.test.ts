import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../shared/types";
import type { Analyzer } from "./grade";
import { evaluatePosition, toWhite } from "./position";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
// Fool's mate: White is checkmated.
const WHITE_MATED = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
// Black to move and stalemated.
const STALEMATE = "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1";

function engineReturning(line: EngineLine): Analyzer & { calls: number } {
  const engine = {
    calls: 0,
    async analyze() {
      engine.calls++;
      return [line];
    },
  };
  return engine;
}

describe("toWhite", () => {
  it("keeps White's scores and flips Black's", () => {
    expect(toWhite({ cp: 40 }, "w")).toEqual({ cp: 40 });
    expect(toWhite({ cp: 40 }, "b")).toEqual({ cp: -40 });
    expect(toWhite({ mate: 3 }, "b")).toEqual({ mate: -3 });
  });
});

describe("evaluatePosition", () => {
  it("returns the engine score from White's side when White is to move", async () => {
    const engine = engineReturning({ score: { cp: 30 }, pv: ["e2e4"] });
    expect(await evaluatePosition(engine, START, 12)).toEqual({ score: { cp: 30 } });
  });

  it("flips the score when Black is to move", async () => {
    const engine = engineReturning({ score: { cp: -25 }, pv: ["c7c5"] });
    expect(await evaluatePosition(engine, AFTER_E4, 12)).toEqual({ score: { cp: 25 } });
  });

  it("reports a finished game without asking the engine", async () => {
    const engine = engineReturning({ score: { cp: 0 }, pv: [] });
    expect(await evaluatePosition(engine, WHITE_MATED, 12)).toEqual({ score: { mate: 0 }, outcome: "black" });
    expect(await evaluatePosition(engine, STALEMATE, 12)).toEqual({ score: { cp: 0 }, outcome: "draw" });
    expect(engine.calls).toBe(0);
  });
});
