import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { Color } from "../../../shared/types";

export interface BoardPiece {
  color: Color;
  type: PieceSymbol;
}

/** Pieces by square. */
export type Placement = Map<Square, BoardPiece>;

export interface Premove {
  from: Square;
  to: Square;
}

const FILES = "abcdefgh";

function at(file: number, rank: number): Square | null {
  return file >= 0 && file < 8 && rank >= 1 && rank <= 8 ? (`${FILES[file]}${rank}` as Square) : null;
}

export function placementOf(fen: string): Placement {
  const placement: Placement = new Map();
  for (const row of new Chess(fen).board()) {
    for (const piece of row) if (piece) placement.set(piece.square, { color: piece.color, type: piece.type });
  }
  return placement;
}

/** Castling rights from a FEN, e.g. "KQkq" or "-". */
export function castlingOf(fen: string): string {
  return fen.split(" ")[2] ?? "-";
}

/**
 * Squares a piece could premove to. The opponent hasn't moved yet, so this uses only how
 * the piece moves: your own pieces block and can't be landed on, but enemy pieces are
 * ignored because they may move away, and pawns may always premove diagonally.
 */
export function premoveTargets(placement: Placement, from: Square, castling: string): Square[] {
  const piece = placement.get(from);
  if (!piece) return [];
  const file = FILES.indexOf(from[0]);
  const rank = Number(from[1]);
  const own = (square: Square | null) => square !== null && placement.get(square)?.color === piece.color;
  const targets: Square[] = [];
  const add = (square: Square | null) => {
    if (square && !own(square)) targets.push(square);
  };
  const ray = (df: number, dr: number) => {
    for (let step = 1; step < 8; step++) {
      const square = at(file + df * step, rank + dr * step);
      if (!square || own(square)) return;
      targets.push(square);
    }
  };

  switch (piece.type) {
    case "p": {
      const dir = piece.color === "w" ? 1 : -1;
      const one = at(file, rank + dir);
      if (one && !own(one)) {
        targets.push(one);
        const startRank = piece.color === "w" ? 2 : 7;
        if (rank === startRank) add(at(file, rank + 2 * dir));
      }
      add(at(file - 1, rank + dir));
      add(at(file + 1, rank + dir));
      break;
    }
    case "n":
      for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
        add(at(file + df, rank + dr));
      }
      break;
    case "b":
    case "r":
    case "q": {
      const diagonal = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
      const straight = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const directions = piece.type === "b" ? diagonal : piece.type === "r" ? straight : [...diagonal, ...straight];
      for (const [df, dr] of directions) ray(df, dr);
      break;
    }
    case "k": {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) if (df || dr) add(at(file + df, rank + dr));
      }
      const home = piece.color === "w" ? 1 : 8;
      if (from === `e${home}`) {
        const [kingSide, queenSide] = piece.color === "w" ? ["K", "Q"] : ["k", "q"];
        if (castling.includes(kingSide)) add(at(6, home));
        if (castling.includes(queenSide)) add(at(2, home));
      }
      break;
    }
  }
  return targets;
}

/**
 * The board as it will look once the queued premoves are played, ignoring the opponent:
 * each premove moves its piece (capturing whatever is there), castling also moves the
 * rook, and a pawn reaching the last rank becomes a queen.
 */
export function withPremoves(placement: Placement, premoves: Premove[]): Placement {
  const result: Placement = new Map(placement);
  for (const { from, to } of premoves) {
    const piece = result.get(from);
    if (!piece) continue;
    result.delete(from);
    const lastRank = to[1] === "8" || to[1] === "1";
    result.set(to, piece.type === "p" && lastRank ? { ...piece, type: "q" } : piece);
    if (piece.type === "k" && from[0] === "e" && (to[0] === "g" || to[0] === "c")) {
      const rank = from[1];
      const [rookFrom, rookTo] = to[0] === "g" ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`];
      const rook = result.get(rookFrom as Square);
      if (rook) {
        result.delete(rookFrom as Square);
        result.set(rookTo as Square, rook);
      }
    }
  }
  return result;
}

/**
 * Which pieces moved between two placements, for animation. A piece that appears is
 * matched with the nearest piece of the same kind that disappeared; a new piece with no
 * match (a promotion) is matched with a vanished pawn of its color.
 */
export function movedPieces(before: Placement, after: Placement): Premove[] {
  const same = (a?: BoardPiece, b?: BoardPiece) => a?.color === b?.color && a?.type === b?.type;
  const vanished = [...before.keys()].filter((square) => !same(before.get(square), after.get(square)));
  const appeared = [...after.keys()].filter((square) => !same(before.get(square), after.get(square)));
  const used = new Set<Square>();
  const moves: Premove[] = [];

  const nearest = (to: Square, fits: (piece: BoardPiece) => boolean) =>
    vanished
      .filter((square) => !used.has(square) && fits(before.get(square)!))
      .sort((a, b) => distance(a, to) - distance(b, to))[0];

  for (const to of appeared) {
    const piece = after.get(to)!;
    const from =
      nearest(to, (p) => same(p, piece)) ??
      (piece.type !== "p" ? nearest(to, (p) => p.color === piece.color && p.type === "p") : undefined);
    if (from) {
      used.add(from);
      moves.push({ from, to });
    }
  }
  return moves;
}

function distance(a: Square, b: Square): number {
  return Math.hypot(FILES.indexOf(a[0]) - FILES.indexOf(b[0]), Number(a[1]) - Number(b[1]));
}
