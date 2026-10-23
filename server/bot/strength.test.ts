import { describe, expect, it } from "vitest";
import { MAX_PLAYABLE_RATING, MIN_PLAYABLE_RATING, strengthFor } from "./strength";

describe("strengthFor", () => {
  it("returns the anchor values at an anchor rating", () => {
    expect(strengthFor(MIN_PLAYABLE_RATING)).toMatchObject({ depth: 1, multipv: 10 });
    expect(strengthFor(MAX_PLAYABLE_RATING)).toMatchObject({ depth: 14, blunderChance: 0 });
  });

  it("interpolates between anchors", () => {
    const low = strengthFor(800);
    const high = strengthFor(1000);
    const mid = strengthFor(900);
    expect(mid.temperature).toBeLessThan(low.temperature);
    expect(mid.temperature).toBeGreaterThan(high.temperature);
    expect(mid.blunderChance).toBeLessThan(low.blunderChance);
    expect(mid.blunderChance).toBeGreaterThan(high.blunderChance);
  });

  it("gets stronger, never weaker, as the rating rises", () => {
    let previous = strengthFor(MIN_PLAYABLE_RATING);
    for (let rating = MIN_PLAYABLE_RATING + 50; rating <= MAX_PLAYABLE_RATING; rating += 50) {
      const current = strengthFor(rating);
      expect(current.depth).toBeGreaterThanOrEqual(previous.depth);
      expect(current.temperature).toBeLessThanOrEqual(previous.temperature);
      expect(current.blunderChance).toBeLessThanOrEqual(previous.blunderChance);
      previous = current;
    }
  });

  it("clamps ratings outside the supported range", () => {
    expect(strengthFor(100)).toEqual(strengthFor(MIN_PLAYABLE_RATING));
    expect(strengthFor(5000)).toEqual(strengthFor(MAX_PLAYABLE_RATING));
  });
});
