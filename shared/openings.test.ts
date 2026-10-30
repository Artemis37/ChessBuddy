import { describe, expect, it } from "vitest";
import {
  bookPlies,
  divergence,
  familyName,
  lineForGame,
  nameMatches,
  openingFamilies,
  openingFor,
  positionKey,
  readLines,
  variationName,
  type OpeningBook,
} from "./openings";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
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

describe("familyName and variationName", () => {
  it("split a line's name at the colon", () => {
    expect(familyName("Sicilian Defense: Najdorf Variation, English Attack")).toBe("Sicilian Defense");
    expect(variationName("Sicilian Defense: Najdorf Variation, English Attack")).toBe("Najdorf Variation, English Attack");
  });

  it("treat a name without a colon as the opening itself", () => {
    expect(familyName("Scandinavian Defense")).toBe("Scandinavian Defense");
    expect(variationName("Scandinavian Defense")).toBe("");
  });
});

describe("openingFamilies", () => {
  const lines = readLines([
    ["B01", "Scandinavian Defense", "e4 d5"],
    ["B90", "Sicilian Defense: Najdorf Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"],
    ["B27", "Sicilian Defense", "e4 c5 Nf3"],
    ["B21", "Sicilian Defense: McDonnell Attack", "e4 c5 f4"],
    ["B20", "Sicilian Defense", "e4 c5"],
  ]);

  it("reads the moves of each line", () => {
    expect(lines[0]).toEqual({ eco: "B01", name: "Scandinavian Defense", moves: ["e4", "d5"] });
  });

  it("puts the openings with the most lines first", () => {
    expect(openingFamilies(lines).map((f) => [f.name, f.lines.length])).toEqual([
      ["Sicilian Defense", 4],
      ["Scandinavian Defense", 1],
    ]);
  });

  it("lists the opening's own lines first, shortest first, then its variations by name", () => {
    expect(openingFamilies(lines)[0].lines.map((l) => [l.name, l.moves.length])).toEqual([
      ["Sicilian Defense", 2],
      ["Sicilian Defense", 3],
      ["Sicilian Defense: McDonnell Attack", 3],
      ["Sicilian Defense: Najdorf Variation", 10],
    ]);
  });
});

describe("nameMatches", () => {
  it("finds every word of the query, in any order and case", () => {
    expect(nameMatches("Sicilian Defense: Najdorf Variation", "najdorf sicilian")).toBe(true);
    expect(nameMatches("Sicilian Defense: Najdorf Variation", "sicilian dragon")).toBe(false);
  });

  it("ignores accents", () => {
    expect(nameMatches("Grünfeld Defense", "grunfeld")).toBe(true);
  });

  it("matches everything for an empty query", () => {
    expect(nameMatches("Ruy Lopez", "  ")).toBe(true);
  });
});

describe("divergence", () => {
  const line = ["e4", "c5", "Nf3", "d6"];

  it("is null while the moves follow the line", () => {
    expect(divergence(line, ["e4", "c5"])).toBeNull();
  });

  it("is null when the moves go on past the end of the line", () => {
    expect(divergence(line, [...line, "d4"])).toBeNull();
  });

  it("is the index of the first move off the line", () => {
    expect(divergence(line, ["e4", "c5", "Nc3", "Nc6"])).toBe(2);
  });
});

describe("bookPlies", () => {
  const next = {
    [positionKey(START)]: ["e4", "d4"],
    [positionKey(AFTER_E4)]: ["c5", "e5"],
    [positionKey(AFTER_E4_C5)]: ["Nf3", "f4"],
  };

  it("counts the first moves the book lists from their positions", () => {
    const moves = [
      { san: "e4", fenBefore: START },
      { san: "c5", fenBefore: AFTER_E4 },
      { san: "f4", fenBefore: AFTER_E4_C5 },
      { san: "g6", fenBefore: AFTER_E4_C5_F4 },
    ];
    expect(bookPlies(moves, next)).toBe(3);
  });

  it("stops at the first move off the book, even if a later one is listed", () => {
    const moves = [
      { san: "e4", fenBefore: START },
      { san: "a6", fenBefore: AFTER_E4 },
      { san: "Nf3", fenBefore: AFTER_E4_C5 },
    ];
    expect(bookPlies(moves, next)).toBe(1);
  });

  it("is 0 when the first move is off the book, or there are no moves", () => {
    expect(bookPlies([{ san: "a3", fenBefore: START }], next)).toBe(0);
    expect(bookPlies([], next)).toBe(0);
  });
});

describe("lineForGame", () => {
  const lines = readLines([
    ["B20", "Sicilian Defense", "e4 c5"],
    ["B27", "Sicilian Defense", "e4 c5 Nf3"],
    ["B21", "Sicilian Defense: McDonnell Attack", "e4 c5 f4"],
    ["B90", "Sicilian Defense: Najdorf Variation", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"],
    ["B90", "Sicilian Defense: Najdorf Variation", "Nf3 c5 e4 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"],
  ]);
  const najdorf = "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3".split(" ");

  it("picks the reached opening's line in the game's move order", () => {
    expect(lineForGame(lines, najdorf, "Sicilian Defense: Najdorf Variation")?.moves[0]).toBe("e4");
    const viaNf3 = ["Nf3", ...najdorf.slice(1, 2), "e4", ...najdorf.slice(3)];
    expect(lineForGame(lines, viaNf3, "Sicilian Defense: Najdorf Variation")?.moves[0]).toBe("Nf3");
  });

  it("takes the line of that name that follows the game furthest, the shorter one on a tie", () => {
    expect(lineForGame(lines, ["e4", "c5", "Nf3", "Nc6"], "Sicilian Defense")?.moves).toEqual(["e4", "c5", "Nf3"]);
    expect(lineForGame(lines, ["e4", "c5", "Nc3"], "Sicilian Defense")?.moves).toEqual(["e4", "c5"]);
  });

  it("without a line of that name, takes the line that follows the game furthest", () => {
    expect(lineForGame(lines, ["e4", "c5", "f4", "e6"], null)?.name).toBe("Sicilian Defense: McDonnell Attack");
    expect(lineForGame(lines, ["e4", "c5", "f4", "e6"], "Not a line")?.name).toBe("Sicilian Defense: McDonnell Attack");
  });

  it("is null when no line starts like the game", () => {
    expect(lineForGame(lines, ["a3"], null)).toBeNull();
    expect(lineForGame([], ["e4"], null)).toBeNull();
  });
});
