import type { PieceSymbol } from "chess.js";
import type { BotRating, Classification, Color, Explanation, MoveGrade } from "../../shared/types";
import type { Branches } from "./thread";

/** The tabs. Analyze is learning an opening and reviewing a game, in one; setup is setting up a position. */
export type Mode = "bot" | "both" | "analyze" | "setup";

/**
 * What Analyze follows: the opening line being learned, or the game being reviewed. The panel
 * shown decides it: the Openings or the Review slide on a desktop, the Openings or the Review
 * page on a phone.
 */
export type Focus = "openings" | "review";

export interface Settings {
  mode: Mode;
  myColor: Color;
  rating: BotRating;
  /** Setting up a position: the bot plays the side that isn't yours. Otherwise you play both. */
  vsBot: boolean;
}

/** Questions to the coach about a move or a position, with the coach's answers and every edited version. */
export interface Questions {
  thread?: Branches | null;
  /** The question waiting for an answer and where in the thread shown it goes, if any. */
  asking?: { question: string; depth: number };
  askError?: string;
}

export interface PlayedMove extends Questions {
  id: number;
  san: string;
  uci: string;
  color: Color;
  /** The piece this move captured, if any. */
  captured?: PieceSymbol;
  fenBefore: string;
  fenAfter: string;
  /**
   * Graded automatically: the player's own moves, or every move when playing both sides, learning
   * an opening or reviewing a game. Others only when asked. Questions
   * (from Questions) can be asked about any move, before or after it is explained.
   */
  graded: boolean;
  /** Learning an opening: the move is in the opening book. */
  book?: boolean;
  /**
   * Not a move but an edit of the position (setting up a position): pieces put on, taken off or
   * moved anywhere, or the side to move or castling changed. It has no SAN or UCI, isn't graded,
   * and steps like a move: going back past it shows the position before. fenAfter may not be a
   * position that can be played yet.
   */
  edit?: boolean;
  grading?: boolean;
  grade?: MoveGrade;
  gradeError?: string;
  explanation?: Explanation;
  explaining?: boolean;
  explainError?: string;
}

/** Each grade's name; its icon is chess.com's, in client/public/grades (see GradeIcon). */
export const CLASSIFICATION: Record<Classification, { label: string }> = {
  best: { label: "Best" },
  excellent: { label: "Excellent" },
  good: { label: "Good" },
  inaccuracy: { label: "Inaccuracy" },
  mistake: { label: "Mistake" },
  blunder: { label: "Blunder" },
};

export function colorName(color: Color): string {
  return color === "w" ? "White" : "Black";
}

export function moveNumber(index: number): string {
  return `${Math.floor(index / 2) + 1}.${index % 2 === 1 ? ".." : ""}`;
}

/** A move's number, as moveNumber, from the position it was played in, so it holds after a set-up position too. */
export function moveNumberOf(move: Pick<PlayedMove, "fenBefore" | "color">): string {
  const number = Number(move.fenBefore.split(" ")[5]) || 1;
  return `${number}.${move.color === "b" ? ".." : ""}`;
}

/** A row of the move list: a move number with White's and Black's move (either may be missing), or an edit on its own. */
export type MoveRow = { number: number; white?: number; black?: number } | { edit: number };

/**
 * The move list's rows, by index into `moves`: White's move starts a row and Black's fills it,
 * each numbered from the position it was played in, so a set-up position that starts with Black,
 * or at move 30, numbers its moves right. An edit takes a row of its own.
 */
export function moveRows(moves: Pick<PlayedMove, "fenBefore" | "color" | "edit">[]): MoveRow[] {
  const rows: MoveRow[] = [];
  moves.forEach((move, i) => {
    if (move.edit) {
      rows.push({ edit: i });
      return;
    }
    const number = Number(move.fenBefore.split(" ")[5]) || 1;
    const last = rows[rows.length - 1];
    if (move.color === "b" && last && "number" in last && last.number === number && last.black === undefined) {
      last.black = i;
    } else {
      rows.push(move.color === "w" ? { number, white: i } : { number, black: i });
    }
  });
  return rows;
}
