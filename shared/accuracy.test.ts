import { describe, expect, it } from "vitest";
import { gameAccuracy, gradeCounts, moveAccuracy } from "./accuracy";
import type { Classification, Color } from "./types";

function move(mover: Color, winBefore: number, winAfter: number) {
  return { mover, winBefore, winAfter };
}

describe("moveAccuracy", () => {
  it("is 100 when the winning chances don't drop", () => {
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(50, 55)).toBe(100);
  });

  it("follows Lichess's curve, with its one-point bonus", () => {
    expect(moveAccuracy(60, 58)).toBeCloseTo(92.395, 3);
    expect(moveAccuracy(50, 40)).toBeCloseTo(64.58, 2);
    expect(moveAccuracy(50, 30)).toBeCloseTo(41.017, 3);
  });

  it("never goes below 0", () => {
    expect(moveAccuracy(100, 0)).toBe(0);
  });
});

describe("gameAccuracy", () => {
  it("is 100 for both sides when nobody loses any winning chances", () => {
    const grades = [move("w", 52, 52), move("b", 48, 48), move("w", 52, 53), move("b", 47, 47)];
    expect(gameAccuracy(grades)).toEqual({ w: 100, b: 100 });
  });

  it("scores each side on its own moves", () => {
    // White keeps 50%; Black's move drops Black from 50% to 30%.
    const { w, b } = gameAccuracy([move("w", 50, 50), move("b", 50, 30)]);
    expect(w).toBe(100);
    expect(b).toBeCloseTo(41.017, 3);
  });

  it("lets one blunder pull a side's accuracy down hard", () => {
    const steady = [move("w", 50, 50), move("b", 50, 50)];
    const grades = Array.from({ length: 10 }, () => steady).flat();
    const blundered = [...grades.slice(0, 18), move("w", 50, 10), move("b", 90, 90)];
    const before = gameAccuracy(grades).w!;
    const after = gameAccuracy(blundered).w!;
    expect(before).toBe(100);
    // One move in ten at 0-ish accuracy costs far more than a tenth of the score.
    expect(after).toBeLessThan(70);
  });

  it("has no accuracy for a side without moves", () => {
    expect(gameAccuracy([move("w", 50, 45)])).toEqual({ w: expect.any(Number), b: null });
    expect(gameAccuracy([])).toEqual({ w: null, b: null });
  });
});

describe("gradeCounts", () => {
  it("counts each side's grades", () => {
    const grades: { mover: Color; classification: Classification }[] = [
      { mover: "w", classification: "best" },
      { mover: "b", classification: "blunder" },
      { mover: "w", classification: "best" },
      { mover: "b", classification: "good" },
    ];
    const counts = gradeCounts(grades);
    expect(counts.w).toEqual({ best: 2, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 });
    expect(counts.b).toMatchObject({ blunder: 1, good: 1, best: 0 });
  });
});
