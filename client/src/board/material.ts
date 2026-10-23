import { Chess, type PieceSymbol } from "chess.js";
import type { Color } from "../../../shared/types";

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** Order chess.com uses for captured pieces. */
const ORDER: PieceSymbol[] = ["p", "n", "b", "r", "q"];

export interface CaptureMove {
  color: Color;
  captured?: PieceSymbol;
}

/** Pieces each side has captured (the opponent's pieces), in chess.com's display order. */
export function capturedBy(moves: CaptureMove[]): Record<Color, PieceSymbol[]> {
  const result: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const move of moves) if (move.captured) result[move.color].push(move.captured);
  for (const color of ["w", "b"] as const) {
    result[color].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  }
  return result;
}

const START_COUNT: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

/**
 * Pieces each side has captured, worked out from the pieces left on the board, for
 * positions reached without the game's move list. A promoted piece counts as a pawn
 * that left the board, not as a capture.
 */
export function capturedInPosition(fen: string): Record<Color, PieceSymbol[]> {
  const count: Record<Color, Record<PieceSymbol, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
  };
  for (const row of new Chess(fen).board()) {
    for (const piece of row) if (piece) count[piece.color][piece.type]++;
  }
  const result: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const color of ["w", "b"] as const) {
    const left = count[color];
    const promoted = ORDER.slice(1).reduce((sum, type) => sum + Math.max(0, left[type] - START_COUNT[type]), 0);
    const capturer = color === "w" ? "b" : "w";
    for (const type of ORDER) {
      const missing = START_COUNT[type] - left[type] - (type === "p" ? promoted : 0);
      for (let i = 0; i < missing; i++) result[capturer].push(type);
    }
  }
  return result;
}

/** White's material minus Black's, in pawns, from the pieces on the board. */
export function materialBalance(fen: string): number {
  let balance = 0;
  for (const row of new Chess(fen).board()) {
    for (const piece of row) {
      if (piece) balance += piece.color === "w" ? VALUE[piece.type] : -VALUE[piece.type];
    }
  }
  return balance;
}
