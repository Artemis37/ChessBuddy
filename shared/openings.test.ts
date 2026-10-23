import { describe, expect, it } from "vitest";
import { openingFor, positionKey, type OpeningBook } from "./openings";

const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E4_C5 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
const AFTER_E4_C5_F4 = "rnbqkbnr/pp1ppppp/8/2p5/4PP2/8/PPPP2PP/RNBQKBNR b KQkq - 0 2";
const OUT_OF_BOOK = "rnbqkbnr/pp1ppp1p/6p1/2p5/4PP2/8/PPPP2PP/RNBQKBNR w KQkq - 0 3";

const BOOK: OpeningBook = {
  [positionKey(AFTER_E4)]: ["B00", "King's Pawn Game"],
  [positionKey(AFTER_E4_C5)]: ["B20", "Sicilian Defense"],
  [positionKey(AFTER_E4_C5_F4)]: ["B21", "Sicilian Defense: McDonnell Attack"],
};

describe("positionKey", () => {
  it("drops the move counters", () => {
    expect(positionKey(AFTER_E4)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -");
  });
});

describe("openingFor", () => {
  it("names the latest position in the book", () => {
    expect(openingFor([AFTER_E4, AFTER_E4_C5, AFTER_E4_C5_F4], BOOK)).toEqual({
      eco: "B21",
      name: "Sicilian Defense: McDonnell Attack",
    });
  });

  it("keeps the last name after the game leaves the book", () => {
    expect(openingFor([AFTER_E4, AFTER_E4_C5, AFTER_E4_C5_F4, OUT_OF_BOOK], BOOK)?.name).toBe(
      "Sicilian Defense: McDonnell Attack",
    );
  });

  it("matches by position, whatever the move counters say", () => {
    const sameWithOtherCounters = AFTER_E4_C5.replace(/0 2$/, "4 7");
    expect(openingFor([sameWithOtherCounters], BOOK)?.name).toBe("Sicilian Defense");
  });

  it("returns null before any book position", () => {
    expect(openingFor([], BOOK)).toBeNull();
  });
});
