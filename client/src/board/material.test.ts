import { describe, expect, it } from "vitest";
import { capturedBy, capturedInPosition, materialBalance } from "./material";

describe("capturedBy", () => {
  it("lists each side's captures in chess.com order", () => {
    expect(
      capturedBy([
        { color: "w", captured: "q" },
        { color: "b" },
        { color: "w", captured: "p" },
        { color: "b", captured: "n" },
        { color: "w", captured: "n" },
      ]),
    ).toEqual({ w: ["p", "n", "q"], b: ["n"] });
  });
});

describe("materialBalance", () => {
  it("is zero at the start", () => {
    expect(materialBalance("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(0);
  });

  it("counts a piece up for the side that has it", () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Nxe5 Nxe5: Black is a knight for a pawn up.
    expect(materialBalance("r1bqkbnr/pppp1ppp/8/4n3/4P3/8/PPPP1PPP/RNBQKB1R w KQkq - 0 4")).toBe(-2);
  });

  it("counts a promoted queen at full value", () => {
    expect(materialBalance("Q6k/8/8/8/8/8/8/K7 b - - 0 1")).toBe(9);
  });
});

describe("capturedInPosition", () => {
  it("lists the pieces missing from the board as the other side's captures", () => {
    // White has taken a knight and a pawn; Black has taken a bishop.
    expect(capturedInPosition("r1bqkbnr/ppp2ppp/8/8/8/8/PPPPPPPP/RN1QKBNR w KQkq - 0 1")).toEqual({
      w: ["p", "p", "n"],
      b: ["b"],
    });
  });

  it("counts a promoted pawn as gone, not captured", () => {
    // White has only its king and two queens: one pawn promoted, the other seven were taken.
    const { b } = capturedInPosition("4k3/8/8/8/8/8/8/Q3K2Q w - - 0 1");
    expect(b).toEqual(["p", "p", "p", "p", "p", "p", "p", "n", "n", "b", "b", "r", "r"]);
  });
});
