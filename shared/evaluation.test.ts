import { describe, expect, it } from "vitest";
import { barFill, barLabel, whiteIsAhead } from "./evaluation";

describe("barFill", () => {
  it("splits the bar evenly for a level position", () => {
    expect(barFill({ score: { cp: 0 } })).toBeCloseTo(50, 5);
  });

  it("gives White more of the bar when White is better", () => {
    expect(barFill({ score: { cp: 150 } })).toBeGreaterThan(60);
    expect(barFill({ score: { cp: -150 } })).toBeLessThan(40);
  });

  it("fills the bar for forced mates and finished games", () => {
    expect(barFill({ score: { mate: 2 } })).toBe(100);
    expect(barFill({ score: { mate: -2 } })).toBe(0);
    expect(barFill({ score: { mate: 0 }, outcome: "black" })).toBe(0);
    expect(barFill({ score: { cp: 0 }, outcome: "draw" })).toBe(50);
  });
});

describe("barLabel", () => {
  it("shows pawns with one decimal and no sign", () => {
    expect(barLabel({ score: { cp: 34 } })).toBe("0.3");
    expect(barLabel({ score: { cp: -250 } })).toBe("2.5");
  });

  it("shows mates and results", () => {
    expect(barLabel({ score: { mate: -3 } })).toBe("M3");
    expect(barLabel({ score: { mate: 0 }, outcome: "white" })).toBe("1-0");
    expect(barLabel({ score: { cp: 0 }, outcome: "draw" })).toBe("½-½");
  });
});

describe("whiteIsAhead", () => {
  it("puts the label on the better side, White when level", () => {
    expect(whiteIsAhead({ score: { cp: 0 } })).toBe(true);
    expect(whiteIsAhead({ score: { cp: -20 } })).toBe(false);
  });
});
