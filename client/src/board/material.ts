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
