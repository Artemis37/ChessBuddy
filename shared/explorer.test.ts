import { describe, expect, it } from "vitest";
import {
  byShare,
  formatGames,
  formatShare,
  isBandRating,
  moveShare,
  RATING_BANDS,
  resultShares,
  type ExplorerStats,
} from "./explorer";

const STATS: ExplorerStats = {
  white: 50,
  draws: 10,
  black: 40,
  moves: [
    { san: "Nf3", white: 30, draws: 6, black: 24 },
    { san: "d4", white: 10, draws: 2, black: 8 },
    { san: "Bc4", white: 0, draws: 0, black: 1 },
  ],
};

describe("RATING_BANDS", () => {
  it("lists the explorer's rating groups in order, from the lowest", () => {
    expect(RATING_BANDS.map((b) => b.rating)).toEqual([0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
    expect(isBandRating(1400)).toBe(true);
    expect(isBandRating(1500)).toBe(false);
  });
});

describe("moveShare", () => {
  it("is the percentage of the position's games that went on with the move", () => {
    expect(moveShare(STATS, "Nf3")).toBe(60);
    expect(moveShare(STATS, "d4")).toBe(20);
  });

  it("is 0 for a move nobody played, or a position no game reached", () => {
    expect(moveShare(STATS, "c4")).toBe(0);
    expect(moveShare({ white: 0, draws: 0, black: 0, moves: [] }, "e4")).toBe(0);
  });
});

describe("resultShares", () => {
  it("gives each result's share of the games", () => {
    expect(resultShares(STATS.moves[0])).toEqual({ white: 50, draws: 10, black: 40 });
  });

  it("is all 0 without games", () => {
    expect(resultShares({ white: 0, draws: 0, black: 0 })).toEqual({ white: 0, draws: 0, black: 0 });
  });
});

describe("formatShare", () => {
  it("rounds to whole percents and marks rare and unplayed moves", () => {
    expect(formatShare(47.4)).toBe("47%");
    expect(formatShare(1)).toBe("1%");
    expect(formatShare(0.4)).toBe("<1%");
    expect(formatShare(0)).toBe("–");
  });
});

describe("formatGames", () => {
  it("shortens large counts", () => {
    expect(formatGames(5_230_000)).toBe("5.2M");
    expect(formatGames(410_400)).toBe("410K");
    expect(formatGames(37)).toBe("37");
  });
});

describe("byShare", () => {
  it("puts the most played first and keeps the order of moves played as often", () => {
    const moves = ["Bc4", "c4", "d4", "Nf3", "b4"];
    expect(byShare(moves, (san) => moveShare(STATS, san))).toEqual(["Nf3", "d4", "Bc4", "c4", "b4"]);
  });
});
