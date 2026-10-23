import type { Square } from "chess.js";
import { describe, expect, it } from "vitest";
import { movedPieces, placementOf, premoveTargets, withPremoves } from "./placement";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const sorted = (squares: Square[]) => [...squares].sort();

describe("premoveTargets", () => {
  it("lets a pawn premove forward and diagonally, even onto empty squares", () => {
    expect(sorted(premoveTargets(placementOf(START), "e2", "KQkq"))).toEqual(["d3", "e3", "e4", "f3"]);
  });

  it("stops sliding pieces at their own pieces but not at the opponent's", () => {
    // White rook on a1, own pawn on a4, black knight on c1.
    const placement = placementOf("4k3/8/8/8/P7/8/8/R1n1K3 b - - 0 1");
    expect(sorted(premoveTargets(placement, "a1", "-"))).toEqual(["a2", "a3", "b1", "c1", "d1"]);
  });

  it("includes castling squares while castling rights remain", () => {
    const placement = placementOf("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1");
    expect(premoveTargets(placement, "e1", "KQkq")).toEqual(expect.arrayContaining(["g1", "c1"]));
    expect(premoveTargets(placement, "e1", "kq")).not.toContain("g1");
  });

  it("gives knights all eight jumps that stay on the board", () => {
    expect(sorted(premoveTargets(placementOf(START), "g1", "KQkq"))).toEqual(["f3", "h3"]);
  });
});

describe("withPremoves", () => {
  it("plays queued premoves on the displayed board, castling included", () => {
    const placement = placementOf("r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1");
    const after = withPremoves(placement, [{ from: "e1", to: "g1" }]);
    expect(after.get("g1")).toEqual({ color: "w", type: "k" });
    expect(after.get("f1")).toEqual({ color: "w", type: "r" });
    expect(after.has("h1")).toBe(false);
  });

  it("shows a pawn premoved to the last rank as a queen", () => {
    const after = withPremoves(placementOf("4k3/P7/8/8/8/8/8/4K3 b - - 0 1"), [{ from: "a7", to: "a8" }]);
    expect(after.get("a8")).toEqual({ color: "w", type: "q" });
  });
});

describe("movedPieces", () => {
  it("finds a simple move", () => {
    const before = placementOf(START);
    const after = placementOf("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    expect(movedPieces(before, after)).toEqual([{ from: "e2", to: "e4" }]);
  });

  it("finds both pieces in castling", () => {
    const before = placementOf("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const after = placementOf("r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1");
    expect(movedPieces(before, after)).toEqual(
      expect.arrayContaining([
        { from: "e1", to: "g1" },
        { from: "h1", to: "f1" },
      ]),
    );
  });

  it("animates a capture as the capturing piece's move only", () => {
    const before = placementOf("4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1");
    const after = placementOf("4k3/8/8/3P4/8/8/8/4K3 b - - 0 1");
    expect(movedPieces(before, after)).toEqual([{ from: "e4", to: "d5" }]);
  });

  it("slides a promoted queen from the pawn's square", () => {
    const before = placementOf("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const after = placementOf("Q3k3/8/8/8/8/8/8/4K3 b - - 0 1");
    expect(movedPieces(before, after)).toEqual([{ from: "a7", to: "a8" }]);
  });

  it("reverses a move when stepping back", () => {
    const before = placementOf("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    expect(movedPieces(before, placementOf(START))).toEqual([{ from: "e4", to: "e2" }]);
  });
});
