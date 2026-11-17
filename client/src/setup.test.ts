import { describe, expect, it } from "vitest";
import {
  castlingOf,
  emptyBoard,
  movePieceFreely,
  pieceAt,
  placePiece,
  positionNotes,
  positionProblem,
  readFenInput,
  samePosition,
  START_FEN,
  turnFixes,
  withCastling,
  withTurn,
} from "./setup";

const KINGS = "4k3/8/8/8/8/8/8/4K3 w - - 0 1";

describe("placing and moving pieces", () => {
  it("puts a piece on a square, replacing what was there, and takes it off again", () => {
    const withQueen = placePiece(KINGS, "d5", { color: "w", type: "q" })!;
    expect(withQueen).toBe("4k3/8/8/3Q4/8/8/8/4K3 w - - 0 1");
    expect(pieceAt(withQueen, "d5")).toEqual({ color: "w", type: "q" });
    expect(placePiece(withQueen, "d5", { color: "b", type: "n" })).toBe("4k3/8/8/3n4/8/8/8/4K3 w - - 0 1");
    expect(placePiece(withQueen, "d5", null)).toBe(KINGS);
  });

  it("refuses a pawn on the first or last rank", () => {
    expect(placePiece(KINGS, "a8", { color: "w", type: "p" })).toBeNull();
    expect(placePiece(KINGS, "h1", { color: "b", type: "p" })).toBeNull();
    const pawn = placePiece(KINGS, "a7", { color: "w", type: "p" })!;
    expect(movePieceFreely(pawn, "a7", "a8")).toBeNull();
  });

  it("moves a piece anywhere, ignoring the rules, and keeps the move number", () => {
    const later = "4k3/8/8/8/8/8/8/4K3 b - - 7 31";
    expect(movePieceFreely(later, "e1", "a5")).toBe("4k3/8/8/K7/8/8/8/8 b - - 0 31");
    expect(movePieceFreely(later, "d4", "a5")).toBeNull();
  });

  it("drops en passant and starts the 50-move count again after an edit", () => {
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 3 1";
    expect(placePiece(afterE4, "h3", { color: "w", type: "n" })).toBe(
      "rnbqkbnr/pppppppp/8/8/4P3/7N/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    );
  });

  it("empties the board", () => {
    expect(emptyBoard(START_FEN)).toBe("8/8/8/8/8/8/8/8 w - - 0 1");
  });
});

describe("castling rights", () => {
  it("go when the king or the rook leaves its square, and come back with it", () => {
    const noRook = placePiece(START_FEN, "h1", null)!;
    expect(castlingOf(noRook)).toEqual(["Q", "k", "q"]);
    const back = placePiece(noRook, "h1", { color: "w", type: "r" })!;
    expect(castlingOf(back)).toEqual(["K", "Q", "k", "q"]);
    expect(castlingOf(movePieceFreely(START_FEN, "e8", "d6")!)).toEqual(["K", "Q"]);
  });

  it("stay off once turned off, while the pieces stay home", () => {
    const off = withCastling(START_FEN, "K", false);
    expect(castlingOf(off)).toEqual(["Q", "k", "q"]);
    expect(castlingOf(placePiece(off, "d4", { color: "w", type: "n" })!)).toEqual(["Q", "k", "q"]);
    expect(castlingOf(withCastling(off, "K", true))).toEqual(["K", "Q", "k", "q"]);
  });

  it("can't be turned on without the king and rook at home", () => {
    expect(castlingOf(withCastling(KINGS, "K", true))).toEqual([]);
  });
});

describe("positionProblem", () => {
  it("is null for a position that can be played", () => {
    expect(positionProblem(START_FEN)).toBeNull();
    expect(positionProblem(KINGS)).toBeNull();
  });

  it("needs exactly one king a side", () => {
    expect(positionProblem(emptyBoard(START_FEN))).toBe("White needs a king.");
    expect(positionProblem("4k3/8/8/8/8/8/8/8 w - - 0 1")).toBe("White needs a king.");
    expect(positionProblem("4k3/8/8/8/8/8/8/K3K3 w - - 0 1")).toBe("White has 2 kings; take all but one off.");
  });

  it("refuses the side not to move in check, which switching the side to move fixes", () => {
    // White's rook on e1 checks the black king, but it's White's move.
    const rookOnE = "4k3/8/8/8/8/8/8/4RK2 w - - 0 1";
    expect(positionProblem(rookOnE)).toBe("Black is in check, but it's White's move.");
    expect(turnFixes(rookOnE)).toBe(true);
    expect(positionProblem(withTurn(rookOnE, "b"))).toBeNull();
    expect(turnFixes(START_FEN)).toBe(false);
  });
});

describe("positionNotes", () => {
  it("notes more pawns or pieces than a game can have, without stopping play", () => {
    const ninePawns = "4k3/8/8/8/8/P7/PPPPPPPP/4K3 w - - 0 1";
    expect(positionNotes(ninePawns)).toEqual(["White has 9 pawns, more than a game can have."]);
    expect(positionProblem(ninePawns)).toBeNull();
    expect(positionNotes(START_FEN)).toEqual([]);
  });
});

describe("readFenInput", () => {
  it("reads a full FEN", () => {
    expect(readFenInput("  r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 4 20 ")).toEqual({ fen: "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 4 20" });
  });

  it("fills in what's missing, and drops castling rights the pieces don't allow", () => {
    expect(readFenInput("4k3/8/8/8/8/8/8/4K2R")).toEqual({ fen: "4k3/8/8/8/8/8/8/4K2R w - - 0 1" });
    expect(readFenInput("4k3/8/8/8/8/8/8/4K2R w KQkq")).toEqual({ fen: "4k3/8/8/8/8/8/8/4K2R w K - 0 1" });
  });

  it("keeps an en passant square only where the rules allow it", () => {
    const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    expect(readFenInput(afterE4)).toEqual({ fen: afterE4 });
    expect(readFenInput("4k3/8/8/8/8/8/8/4K3 w - e6 0 1")).toEqual({ fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1" });
  });

  it("loads a position that can't be played yet, but says what's wrong with a malformed one", () => {
    expect(readFenInput("8/8/8/8/8/8/8/8 w - - 0 1")).toEqual({ fen: "8/8/8/8/8/8/8/8 w - - 0 1" });
    expect(readFenInput("hello")).toHaveProperty("error");
    expect(readFenInput("8/8/8/8/8/8/8 w")).toHaveProperty("error");
    expect(readFenInput("4k3/8/8/8/8/8/8/4K3 x")).toHaveProperty("error");
    expect(readFenInput("P3k3/8/8/8/8/8/8/4K3 w")).toEqual({ error: "Pawns can't stand on the first or last rank." });
  });
});

describe("samePosition", () => {
  it("ignores the move counters and en passant", () => {
    expect(samePosition(KINGS, "4k3/8/8/8/8/8/8/4K3 w - - 9 40")).toBe(true);
    expect(samePosition(KINGS, withTurn(KINGS, "b"))).toBe(false);
  });
});
