import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../shared/types";
import { pickMove } from "./chooseMove";
import type { Strength } from "./strength";

const lines: EngineLine[] = [
  { score: { cp: 50 }, pv: ["e2e4"] },
  { score: { cp: 40 }, pv: ["d2d4"] },
  { score: { cp: -200 }, pv: ["g2g4"] },
];
const legal = ["e2e4", "d2d4", "g2g4", "a2a3", "h2h3"];

const strength = (overrides: Partial<Strength>): Strength => ({
  depth: 5,
  multipv: 3,
  temperature: 50,
  blunderChance: 0,
  ...overrides,
});

/** Deterministic random numbers that cycle through the given values. */
function sequence(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("pickMove", () => {
  it("plays the best move when the temperature is near zero", () => {
    expect(pickMove(lines, legal, strength({ temperature: 0.001 }), sequence(0.99, 0.99))).toBe("e2e4");
  });

  it("plays a close second choice some of the time", () => {
    const picks = new Set<string>();
    for (const r of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      picks.add(pickMove(lines, legal, strength({ temperature: 50 }), sequence(0.99, r)));
    }
    expect(picks).toEqual(new Set(["e2e4", "d2d4"]));
  });

  it("almost never picks a move that loses two pawns at a club-level temperature", () => {
    let blunders = 0;
    for (let i = 0; i < 100; i++) {
      if (pickMove(lines, legal, strength({ temperature: 50 }), sequence(0.99, i / 100)) === "g2g4") blunders++;
    }
    expect(blunders).toBeLessThanOrEqual(2);
  });

  it("plays a random legal move when the blunder roll hits", () => {
    // 0.1 < 0.5 triggers the blunder; 0.9 selects the last of the five legal moves.
    expect(pickMove(lines, legal, strength({ blunderChance: 0.5 }), sequence(0.1, 0.9))).toBe("h2h3");
  });

  it("prefers a forced mate over any normal move", () => {
    const mateLines: EngineLine[] = [
      { score: { mate: 2 }, pv: ["d2d4"] },
      { score: { cp: 900 }, pv: ["e2e4"] },
    ];
    expect(pickMove(mateLines, legal, strength({ temperature: 260 }), sequence(0.99, 0.99))).toBe("d2d4");
  });

  it("falls back to a legal move when the engine gives no candidates", () => {
    expect(legal).toContain(pickMove([], legal, strength({}), sequence(0.99, 0.4)));
  });
});
