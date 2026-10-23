import { describe, expect, it } from "vitest";
import { classify, formatEval, negate, winPercent } from "./evaluation";

describe("winPercent", () => {
  it("is 50 for a level position", () => {
    expect(winPercent({ cp: 0 })).toBeCloseTo(50, 5);
  });

  it("follows the Lichess curve and is symmetric", () => {
    expect(winPercent({ cp: 100 })).toBeCloseTo(59.1, 1);
    expect(winPercent({ cp: -100 })).toBeCloseTo(40.9, 1);
  });

  it("caps centipawns at 1000", () => {
    expect(winPercent({ cp: 5000 })).toBeCloseTo(winPercent({ cp: 1000 }), 5);
  });

  it("is 100 or 0 for forced mates", () => {
    expect(winPercent({ mate: 3 })).toBe(100);
    expect(winPercent({ mate: -2 })).toBe(0);
  });
});

describe("negate", () => {
  it("flips the point of view", () => {
    expect(negate({ cp: 35 })).toEqual({ cp: -35 });
    expect(negate({ mate: 4 })).toEqual({ mate: -4 });
  });
});

describe("formatEval", () => {
  it("formats pawns and mates", () => {
    expect(formatEval({ cp: 34 })).toBe("+0.34");
    expect(formatEval({ cp: -250 })).toBe("-2.50");
    expect(formatEval({ cp: 0 })).toBe("0.00");
    expect(formatEval({ mate: 3 })).toBe("#3");
    expect(formatEval({ mate: -2 })).toBe("-#2");
  });
});

describe("classify", () => {
  it("calls the engine's first choice best regardless of drop", () => {
    expect(classify(0.4, true)).toBe("best");
  });

  it("buckets by drop in winning chances", () => {
    expect(classify(1.9, false)).toBe("excellent");
    expect(classify(2, false)).toBe("good");
    expect(classify(5, false)).toBe("inaccuracy");
    expect(classify(10, false)).toBe("mistake");
    expect(classify(19.9, false)).toBe("mistake");
    expect(classify(20, false)).toBe("blunder");
  });
});
