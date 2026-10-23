import type { Square } from "chess.js";
import type { Color } from "../../../shared/types";

const FILES = "abcdefgh";

/** The square shown at a grid cell; row 0 is the top of the board as displayed. */
export function squareAt(col: number, row: number, orientation: Color): Square {
  const file = orientation === "w" ? col : 7 - col;
  const rank = orientation === "w" ? 8 - row : row + 1;
  return `${FILES[file]}${rank}` as Square;
}

/** Grid cell (column and row from the top-left as displayed) of a square. */
export function cellOf(square: Square, orientation: Color): { col: number; row: number } {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  return orientation === "w" ? { col: file, row: 8 - rank } : { col: 7 - file, row: rank - 1 };
}

/** The square under a point measured from the board's top-left corner, or null outside the board. */
export function squareAtPoint(x: number, y: number, boardSize: number, orientation: Color): Square | null {
  if (x < 0 || y < 0 || x >= boardSize || y >= boardSize) return null;
  const size = boardSize / 8;
  return squareAt(Math.floor(x / size), Math.floor(y / size), orientation);
}

export function isLightSquare(square: Square): boolean {
  return (FILES.indexOf(square[0]) + Number(square[1])) % 2 === 0;
}

/** All 64 squares in display order: left to right, top to bottom. */
export function displaySquares(orientation: Color): Square[] {
  const squares: Square[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) squares.push(squareAt(col, row, orientation));
  }
  return squares;
}
