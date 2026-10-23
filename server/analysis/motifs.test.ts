import { describe, expect, it } from "vitest";
import { hangingPieces, materialSwing, sanLine } from "./motifs";

// 1.e4 e5 2.Nf3 Nc6, White to move
const ITALIAN_START = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

describe("sanLine", () => {
  it("converts a UCI line to SAN", () => {
    expect(sanLine(ITALIAN_START, ["f3e5", "c6e5", "d2d4"])).toEqual(["Nxe5", "Nxe5", "d4"]);
  });

  it("stops at the first illegal move", () => {
    expect(sanLine(ITALIAN_START, ["f1c4", "a1a8"])).toEqual(["Bc4"]);
  });
});

describe("materialSwing", () => {
  it("reports the net material change for the given side along a line", () => {
    // Nxe5 wins a pawn, Nxe5 loses the knight: White is 2 points down overall.
    expect(materialSwing(ITALIAN_START, ["f3e5", "c6e5", "d2d4", "e5c6"], "w")).toBe(-2);
  });

  it("finishes a capture sequence that runs past the ply limit", () => {
    const line = ["f1c4", "g8f6", "d2d3", "f8c5", "c2c3", "d7d6", "b2b4", "c5b6", "f3e5", "c6e5"];
    expect(materialSwing(ITALIAN_START, line, "w", 9)).toBe(-2);
  });
});

describe("hangingPieces", () => {
  it("finds an undefended piece that is attacked", () => {
    // White bishop on c4 attacked by a black knight on b6, nothing defends c4.
    const fen = "r1bqkb1r/pppp1ppp/1n6/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 5";
    expect(hangingPieces(fen, "w")).toEqual([
      "Your bishop on c4 is attacked by the knight on b6 and not defended.",
    ]);
  });

  it("finds a piece attacked by a cheaper piece even when defended", () => {
    // White knight on e5 is attacked by the d6 pawn and defended by the d4 pawn.
    const fen = "rnbqkbnr/ppp2ppp/3p4/4N3/3P4/8/PPP1PPPP/RNBQKB1R w KQkq - 0 4";
    expect(hangingPieces(fen, "w")).toEqual([
      "Your knight on e5 is attacked by the pawn on d6, a cheaper piece.",
    ]);
  });

  it("ignores pieces that are safely defended", () => {
    expect(hangingPieces(ITALIAN_START, "w")).toEqual([]);
  });
});
