import { describe, expect, it } from "vitest";
import { moveNumberOf, moveRows } from "./game";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const white = (fenBefore: string) => ({ fenBefore, color: "w" as const });
const black = (fenBefore: string) => ({ fenBefore, color: "b" as const });

describe("moveRows", () => {
  it("pairs White's and Black's moves under their numbers, as the list always did", () => {
    expect(moveRows([white(START), black(AFTER_E4), white(AFTER_E5)])).toEqual([
      { number: 1, white: 0, black: 1 },
      { number: 2, white: 2 },
    ]);
  });

  it("starts a set-up position's moves at its own number and side", () => {
    const blackAt30 = "4k3/8/8/8/8/8/8/4K3 b - - 0 30";
    const whiteAt31 = "8/4k3/8/8/8/8/8/4K3 w - - 1 31";
    expect(moveRows([black(blackAt30), white(whiteAt31)])).toEqual([{ number: 30, black: 0 }, { number: 31, white: 1 }]);
  });

  it("gives an edit a row of its own, and Black's move after it a new row", () => {
    const edit = { fenBefore: AFTER_E4, color: "b" as const, edit: true };
    expect(moveRows([white(START), edit, black(AFTER_E4)])).toEqual([
      { number: 1, white: 0 },
      { edit: 1 },
      { number: 1, black: 2 },
    ]);
  });
});

describe("moveNumberOf", () => {
  it("numbers a move from the position it was played in", () => {
    expect(moveNumberOf(white(START))).toBe("1.");
    expect(moveNumberOf(black(AFTER_E4))).toBe("1...");
    expect(moveNumberOf(black("4k3/8/8/8/8/8/8/4K3 b - - 0 30"))).toBe("30...");
  });
});
