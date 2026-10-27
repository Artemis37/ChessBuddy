import type { PieceSymbol } from "chess.js";
import type { BotRating, Classification, Color, Explanation, MoveGrade } from "../../shared/types";
import type { Branches } from "./thread";

export type Mode = "bot" | "both" | "learn" | "review";

export interface Settings {
  mode: Mode;
  myColor: Color;
  rating: BotRating;
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
   * Graded automatically: the player's own moves, every move when playing both sides or reviewing
   * a game, or moves off the book when learning an opening. Others only when asked. Questions
   * (from Questions) can be asked about any move, before or after it is explained.
   */
  graded: boolean;
  /** Learning an opening: the move is in the opening book. */
  book?: boolean;
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
