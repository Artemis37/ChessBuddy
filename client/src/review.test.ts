import { describe, expect, it } from "vitest";
import type { PlayedMove } from "./game";
import { dateLabel, nextToGrade, scoreOf, sideOf, timeControlLabel, toReviewGame } from "./review";

function played(patch: Partial<PlayedMove> = {}): PlayedMove {
  return { id: 0, san: "e4", uci: "e2e4", color: "w", fenBefore: "", fenAfter: "", graded: true, ...patch };
}

describe("toReviewGame", () => {
  const moves = [{ san: "e4", uci: "e2e4" }];

  it("reads the players, result and page from the tags", () => {
    const game = toReviewGame({
      headers: {
        White: "Alice",
        Black: "Bob",
        WhiteElo: "1500",
        BlackElo: "?",
        Result: "1/2-1/2",
        Termination: "Game drawn by repetition",
        Link: "https://www.chess.com/game/live/1",
        UTCDate: "2026.10.25",
        Date: "2026.10.24",
        TimeControl: "600",
      },
      moves,
    });
    expect(game).toEqual({
      white: { name: "Alice", rating: 1500 },
      black: { name: "Bob", rating: undefined },
      result: "1/2-1/2",
      termination: "Game drawn by repetition",
      url: "https://www.chess.com/game/live/1",
      date: "2026.10.25",
      timeControl: "600",
      moves,
    });
  });

  it("fills in what a bare PGN leaves out, and only links to https pages", () => {
    const game = toReviewGame({ headers: { Result: "*", Site: "javascript:alert(1)" }, moves });
    expect(game.white.name).toBe("White");
    expect(game.black.name).toBe("Black");
    expect(game.result).toBe("*");
    expect(game.url).toBeUndefined();
    expect(toReviewGame({ headers: { Site: "https://lichess.org/abc" }, moves }).url).toBe("https://lichess.org/abc");
  });

  it("finds the side a player had, whatever the case of the name", () => {
    const game = toReviewGame({ headers: { White: "Alice", Black: "Bob" }, moves });
    expect(sideOf(game, " alice ")).toBe("w");
    expect(sideOf(game, "BOB")).toBe("b");
    expect(sideOf(game, "carol")).toBeNull();
    expect(sideOf(game, "")).toBeNull();
  });
});

describe("labels", () => {
  it("writes time controls the way Chess.com does", () => {
    expect(timeControlLabel("180")).toBe("3 min");
    expect(timeControlLabel("180+2")).toBe("3 | 2");
    expect(timeControlLabel("600+0")).toBe("10 min");
    expect(timeControlLabel("30")).toBe("30 sec");
    expect(timeControlLabel("1/86400")).toBe("1 day");
    expect(timeControlLabel("1/259200")).toBe("3 days");
    expect(timeControlLabel("-")).toBeNull();
    expect(timeControlLabel(undefined)).toBeNull();
  });

  it("shows a draw as ½-½", () => {
    expect(scoreOf("1/2-1/2")).toBe("½-½");
    expect(scoreOf("1-0")).toBe("1-0");
  });

  it("reads PGN dates and skips unknown ones", () => {
    expect(dateLabel("2026.10.25")).toContain("2026");
    expect(dateLabel("2026.??.??")).toBeNull();
    expect(dateLabel(undefined)).toBeNull();
  });
});

describe("nextToGrade", () => {
  it("starts with the earliest moves waiting, up to the number free", () => {
    const moves = [played({ grade: {} as never }), played({ grading: true }), played(), played(), played()];
    expect(nextToGrade(moves, -1, 1)).toEqual([2]);
    expect(nextToGrade(moves, -1, 2)).toEqual([2, 3]);
    expect(nextToGrade(moves, -1, 0)).toEqual([]);
  });

  it("grades the move on the board first", () => {
    const moves = [played(), played(), played(), played()];
    expect(nextToGrade(moves, 3, 2)).toEqual([3, 0]);
  });

  it("skips moves that aren't graded automatically or failed", () => {
    const moves = [played({ graded: false }), played({ gradeError: "Engine down" }), played()];
    expect(nextToGrade(moves, 1, 2)).toEqual([2]);
  });
});
