import { Chess, validateFen, type PieceSymbol, type Square } from "chess.js";
import type { Color } from "../../shared/types";

/**
 * Setting up a position: pieces put on the board, taken off or moved anywhere, the side to move
 * and the castling rights. Positions are FENs throughout, and may be illegal while you edit
 * them (no king yet, say); positionProblem says what stops play.
 */

export interface SetupPiece {
  color: Color;
  type: PieceSymbol;
}

type Placement = Map<Square, SetupPiece>;

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FILES = "abcdefgh";
const CASTLING = ["K", "Q", "k", "q"] as const;
export type CastlingRight = (typeof CASTLING)[number];
/** The king's and the rook's starting squares each right needs. */
const CASTLING_SQUARES: Record<CastlingRight, { king: Square; rook: Square; color: Color }> = {
  K: { king: "e1", rook: "h1", color: "w" },
  Q: { king: "e1", rook: "a1", color: "w" },
  k: { king: "e8", rook: "h8", color: "b" },
  q: { king: "e8", rook: "a8", color: "b" },
};

function readPlacement(fen: string): Placement {
  const placement: Placement = new Map();
  fen
    .split(" ")[0]
    .split("/")
    .forEach((row, i) => {
      let file = 0;
      for (const char of row) {
        if (/\d/.test(char)) {
          file += Number(char);
          continue;
        }
        const square = `${FILES[file]}${8 - i}` as Square;
        placement.set(square, { color: char === char.toUpperCase() ? "w" : "b", type: char.toLowerCase() as PieceSymbol });
        file++;
      }
    });
  return placement;
}

function writePlacement(placement: Placement): string {
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = "";
    let empty = 0;
    for (const file of FILES) {
      const piece = placement.get(`${file}${rank}` as Square);
      if (!piece) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += piece.color === "w" ? piece.type.toUpperCase() : piece.type;
    }
    rows.push(empty ? row + empty : row);
  }
  return rows.join("/");
}

/** The side to move in a FEN. */
export function turnOf(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** The castling rights the pieces allow: the king and that rook on their starting squares. */
export function possibleCastling(fen: string): CastlingRight[] {
  const placement = readPlacement(fen);
  const at = (square: Square, type: PieceSymbol, color: Color) =>
    placement.get(square)?.type === type && placement.get(square)?.color === color;
  return CASTLING.filter((right) => {
    const { king, rook, color } = CASTLING_SQUARES[right];
    return at(king, "k", color) && at(rook, "r", color);
  });
}

/** The castling rights a FEN gives, of those its pieces allow. */
export function castlingOf(fen: string): CastlingRight[] {
  const given = fen.split(" ")[2] ?? "-";
  return possibleCastling(fen).filter((right) => given.includes(right));
}

function withFields(fen: string, placement: string, turn: Color, castling: CastlingRight[]): string {
  const fullmove = Number(fen.split(" ")[5]) || 1;
  // After an edit there's no en passant capture, and the 50-move count starts again.
  return `${placement} ${turn} ${castling.join("") || "-"} - 0 ${fullmove}`;
}

/**
 * The position after changing its pieces. A castling right goes once its king or rook leaves its
 * square, stays off if you turned it off, and comes on when its king and rook are put back.
 */
function editPieces(fen: string, change: (placement: Placement) => void): string {
  const placement = readPlacement(fen);
  change(placement);
  const before = possibleCastling(fen);
  const kept = castlingOf(fen);
  const draft = withFields(fen, writePlacement(placement), turnOf(fen), []);
  const rights = possibleCastling(draft).filter((right) => kept.includes(right) || !before.includes(right));
  return withFields(fen, writePlacement(placement), turnOf(fen), rights);
}

function isBackRank(square: Square): boolean {
  return square[1] === "1" || square[1] === "8";
}

/**
 * Puts `piece` on `square`, replacing what was there, or with null takes the piece there off.
 * Null when it can't go there: a pawn on the first or last rank.
 */
export function placePiece(fen: string, square: Square, piece: SetupPiece | null): string | null {
  if (piece?.type === "p" && isBackRank(square)) return null;
  return editPieces(fen, (placement) => {
    if (piece) placement.set(square, piece);
    else placement.delete(square);
  });
}

/** Moves the piece on `from` to `to` without the rules of chess, replacing what was there. */
export function movePieceFreely(fen: string, from: Square, to: Square): string | null {
  const piece = readPlacement(fen).get(from);
  if (!piece || from === to || (piece.type === "p" && isBackRank(to))) return null;
  return editPieces(fen, (placement) => {
    placement.delete(from);
    placement.set(to, piece);
  });
}

/** The piece on a square, if any. */
export function pieceAt(fen: string, square: Square): SetupPiece | undefined {
  return readPlacement(fen).get(square);
}

export function withTurn(fen: string, turn: Color): string {
  const [placement] = fen.split(" ");
  return withFields(fen, placement, turn, castlingOf(fen));
}

/** Turns one castling right on or off; one the pieces don't allow stays off. */
export function withCastling(fen: string, right: CastlingRight, on: boolean): string {
  const rights = castlingOf(fen).filter((r) => r !== right);
  if (on && possibleCastling(fen).includes(right)) rights.push(right);
  const [placement] = fen.split(" ");
  return withFields(fen, placement, turnOf(fen), CASTLING.filter((r) => rights.includes(r)));
}

/** The board with every piece taken off. */
export function emptyBoard(fen: string): string {
  return withFields(fen, "8/8/8/8/8/8/8/8", turnOf(fen), []);
}

/** The same position, ignoring the move counters and en passant: what the board and the rules show. */
export function samePosition(a: string, b: string): boolean {
  return a.split(" ").slice(0, 3).join(" ") === b.split(" ").slice(0, 3).join(" ");
}

function colorName(color: Color): string {
  return color === "w" ? "White" : "Black";
}

/**
 * What stops the position from being played, or null: each side needs exactly one king, no pawn
 * may stand on the first or last rank, and the side not to move can't be in check.
 */
export function positionProblem(fen: string): string | null {
  const pieces = [...readPlacement(fen)];
  for (const color of ["w", "b"] as const) {
    const kings = pieces.filter(([, p]) => p.type === "k" && p.color === color).length;
    if (kings === 0) return `${colorName(color)} needs a king.`;
    if (kings > 1) return `${colorName(color)} has ${kings} kings; take all but one off.`;
  }
  if (pieces.some(([square, p]) => p.type === "p" && isBackRank(square))) {
    return "Pawns can't stand on the first or last rank.";
  }
  const valid = validateFen(fen);
  if (!valid.ok) return (valid.error ?? "The position isn't valid.").replace(/^Invalid FEN: /, "");
  const chess = new Chess(fen);
  const waiting = turnOf(fen) === "w" ? "b" : "w";
  const [king] = chess.findPiece({ type: "k", color: waiting });
  if (chess.isAttacked(king, turnOf(fen))) {
    return `${colorName(waiting)} is in check, but it's ${colorName(turnOf(fen))}'s move.`;
  }
  return null;
}

/** True when the position's only problem is the side to move, and giving the move to the other side fixes it. */
export function turnFixes(fen: string): boolean {
  const other = turnOf(fen) === "w" ? "b" : "w";
  return positionProblem(fen) !== null && positionProblem(withTurn(fen, other)) === null;
}

/** Things a real game can't reach, which don't stop play: more than 8 pawns or 16 pieces a side. */
export function positionNotes(fen: string): string[] {
  const pieces = [...readPlacement(fen).values()];
  const notes: string[] = [];
  for (const color of ["w", "b"] as const) {
    const own = pieces.filter((p) => p.color === color);
    const pawns = own.filter((p) => p.type === "p").length;
    if (pawns > 8) notes.push(`${colorName(color)} has ${pawns} pawns, more than a game can have.`);
    else if (own.length > 16) notes.push(`${colorName(color)} has ${own.length} pieces, more than a game can have.`);
  }
  return notes;
}

/**
 * Reads a pasted FEN. Just the pieces, or the pieces and the side to move, are enough; the rest
 * gets defaults. Castling rights the pieces don't allow are dropped. A position that can't be
 * played yet loads too (positionProblem says why), unless a pawn stands on the first or last rank.
 */
export function readFenInput(text: string): { fen: string } | { error: string } {
  const fields = text.trim().split(/\s+/);
  const [placement, turn = "w", castling = "-", passant = "-", halfmove = "0", fullmove = "1"] = fields;
  if (!placement || fields.length > 6) return { error: "That isn't a FEN: it should look like the one shown here." };
  const rows = placement.split("/");
  const rowOk = (row: string) =>
    /^[pnbrqkPNBRQK1-8]+$/.test(row) && [...row].reduce((n, c) => n + (/\d/.test(c) ? Number(c) : 1), 0) === 8;
  if (rows.length !== 8 || !rows.every(rowOk)) {
    return { error: "The pieces part needs 8 ranks of 8 squares, separated by /." };
  }
  if (turn !== "w" && turn !== "b") return { error: 'The side to move must be "w" or "b".' };
  if (!/^(-|K?Q?k?q?)$/.test(castling) || castling === "") return { error: "The castling rights must be like KQkq, or -." };
  if (!/^(-|[a-h][36])$/.test(passant)) return { error: "The en passant square must be like e3 or e6, or -." };
  if (!/^\d+$/.test(halfmove) || !/^[1-9]\d*$/.test(fullmove)) return { error: "The move counters must be whole numbers." };
  const draft = `${placement} ${turn} ${castling} ${passant} ${halfmove} ${fullmove}`;
  if ([...readPlacement(draft)].some(([square, p]) => p.type === "p" && isBackRank(square))) {
    return { error: "Pawns can't stand on the first or last rank." };
  }
  const rights = castlingOf(draft).join("") || "-";
  const kept = passant !== "-" && passantPossible(readPlacement(draft), turn, passant as Square) ? passant : "-";
  return { fen: `${placement} ${turn} ${rights} ${kept} ${halfmove} ${fullmove}` };
}

/**
 * Whether a pawn can just have passed `square` with a double step: the side not to move has a
 * pawn just past it, and it and the pawn's starting square are empty.
 */
function passantPossible(placement: Placement, turn: string, square: Square): boolean {
  const file = square[0];
  const [passed, landed, start] = turn === "w" ? ["6", "5", "7"] : ["3", "4", "2"];
  const pawn = placement.get(`${file}${landed}` as Square);
  return (
    square[1] === passed &&
    pawn?.type === "p" &&
    pawn.color !== turn &&
    !placement.has(square) &&
    !placement.has(`${file}${start}` as Square)
  );
}
