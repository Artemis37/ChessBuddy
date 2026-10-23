/** Opening book keyed by position: piece placement, side to move, castling rights and en passant square. */
export type OpeningBook = Record<string, [eco: string, name: string]>;

export interface Opening {
  eco: string;
  name: string;
}

/** The part of a FEN that identifies the position, without the move counters. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * Name of the opening reached by a game, given the positions after each move in order.
 * Matches by position, so transpositions are named correctly; once the game leaves the book,
 * the last named position keeps its name, as on chess.com.
 */
export function openingFor(positions: string[], book: OpeningBook): Opening | null {
  for (let i = positions.length - 1; i >= 0; i--) {
    const entry = book[positionKey(positions[i])];
    if (entry) return { eco: entry[0], name: entry[1] };
  }
  return null;
}
