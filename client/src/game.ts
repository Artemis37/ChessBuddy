import type { PieceSymbol } from "chess.js";
import type { BotRating, Classification, CoachReply, Color, Explanation, MoveGrade } from "../../shared/types";

export type Mode = "bot" | "both";

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
  /** Graded automatically: the player's own moves, or every move when playing both sides. Others only when asked. */
  graded: boolean;
  grading?: boolean;
  grade?: MoveGrade;
  gradeError?: string;
  explanation?: Explanation;
  explaining?: boolean;
  explainError?: string;
  /** Follow-up questions about the explanation, with the coach's answers. */
  thread?: Exchange[];
  /** The question waiting for an answer, if any. */
  asking?: string;
  askError?: string;
}

export interface Exchange {
  question: string;
  reply: CoachReply;
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
