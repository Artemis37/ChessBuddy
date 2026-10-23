import { describe, expect, it } from "vitest";
import { parseBestMove, parseLines } from "./uci";

const output = [
  "Stockfish 17.1 by the Stockfish developers (see AUTHORS file)",
  "info string Using 2 threads",
  "info depth 15 seldepth 20 multipv 1 score cp 40 nodes 1000 nps 1 pv f1b5 a7a6",
  "info depth 15 seldepth 18 multipv 2 score cp 31 nodes 1000 nps 1 pv f1c4 g8f6",
  "info depth 16 seldepth 21 multipv 1 score cp 38 upperbound nodes 1200 nps 1 pv f1b5",
  "info depth 16 seldepth 21 multipv 1 score cp 36 nodes 1300 nps 1 pv f1b5 g8f6 e1g1",
  "info depth 16 seldepth 19 multipv 2 score cp 30 nodes 1300 nps 1 pv d2d4 e5d4 f3d4",
  "info depth 16 seldepth 22 multipv 3 score mate -4 nodes 1300 nps 1 pv f3e5 c6e5",
  "bestmove f1b5 ponder g8f6",
];

describe("parseLines", () => {
  it("keeps the deepest exact line for each multipv slot, in order", () => {
    expect(parseLines(output)).toEqual([
      { score: { cp: 36 }, pv: ["f1b5", "g8f6", "e1g1"] },
      { score: { cp: 30 }, pv: ["d2d4", "e5d4", "f3d4"] },
      { score: { mate: -4 }, pv: ["f3e5", "c6e5"] },
    ]);
  });

  it("treats output without multipv as slot 1", () => {
    expect(parseLines(["info depth 3 score cp -12 pv e7e5", "bestmove e7e5"])).toEqual([
      { score: { cp: -12 }, pv: ["e7e5"] },
    ]);
  });

  it("returns a mated position as a single mate-0 line with no moves", () => {
    expect(parseLines(["info depth 0 score mate 0", "bestmove (none)"])).toEqual([
      { score: { mate: 0 }, pv: [] },
    ]);
  });
});

describe("parseBestMove", () => {
  it("reads the bestmove line", () => {
    expect(parseBestMove(output)).toBe("f1b5");
  });

  it("returns null when there is no legal move", () => {
    expect(parseBestMove(["bestmove (none)"])).toBeNull();
  });
});
