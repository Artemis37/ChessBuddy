import type { PieceSymbol } from "chess.js";
import type { BotRating, Classification, Color, Explanation, MoveGrade } from "../../shared/types";
import type { Branches } from "./thread";

export type Mode = "bot" | "both" | "learn";

export interface Settings {
  mode: Mode;
  myColor: Color;
  rating: BotRating;
}

export interface PlayedMove {
  id: number;
  san: string;
  uci: string;
  color: Color;
  /** The piece this move captured, if any. */
  captured?: PieceSymbol;
  fenBefore: string;
  fenAfter: string;
  /**
   * Graded automatically: the player's own moves, every move when playing both sides, or moves
   * off the book when learning an opening. Others only when asked.
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
  /** Follow-up questions about the explanation, with the coach's answers and every edited version. */
  thread?: Branches | null;
  /** The question waiting for an answer and where in the thread shown it goes, if any. */
  asking?: { question: string; depth: number };
  askError?: string;
}

export const CLASSIFICATION: Record<Classification, { label: string; symbol: string }> = {
  best: { label: "Best", symbol: "★" },
  excellent: { label: "Excellent", symbol: "!" },
  good: { label: "Good", symbol: "✓" },
  inaccuracy: { label: "Inaccuracy", symbol: "?!" },
  mistake: { label: "Mistake", symbol: "?" },
  blunder: { label: "Blunder", symbol: "??" },
};

export function colorName(color: Color): string {
  return color === "w" ? "White" : "Black";
}

export function moveNumber(index: number): string {
  return `${Math.floor(index / 2) + 1}.${index % 2 === 1 ? ".." : ""}`;
}
