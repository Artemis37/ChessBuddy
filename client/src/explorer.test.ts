import { describe, expect, it } from "vitest";
import { cachedStats, loadBand, loadOrder } from "./explorer";

describe("loadOrder", () => {
  it("asks for the chosen band first, then the nearest ones", () => {
    expect(loadOrder(1400)).toEqual([1400, 1200, 1600, 1000, 1800, 2000, 2200, 2500, 0]);
    expect(loadOrder(0)).toEqual([0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
  });
});

describe("without browser storage", () => {
  it("has nothing cached and uses the default band", () => {
    expect(cachedStats("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 1400)).toBeUndefined();
    expect(loadBand()).toBe(1400);
  });
});
