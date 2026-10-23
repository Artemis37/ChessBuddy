import { describe, expect, it } from "vitest";
import { numberedLine } from "./notation";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// After 1.e4 e6 2.Ba6, Black to move
const AFTER_BA6 = "rnbqkbnr/pppp1ppp/B3p3/8/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2";

describe("numberedLine", () => {
  it("numbers a line that starts with White", () => {
    expect(numberedLine(START, ["e4", "e6", "Bc4"])).toBe("1. e4 e6 2. Bc4");
  });

  it("marks a line that starts with Black with an ellipsis", () => {
    expect(numberedLine(AFTER_BA6, ["Nxa6", "d4", "b5"])).toBe("2... Nxa6 3. d4 b5");
  });

  it("returns an empty string for an empty line", () => {
    expect(numberedLine(START, [])).toBe("");
  });
});
