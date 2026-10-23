import type { PieceSymbol } from "chess.js";
import type { BotRating, Color, Explanation, MoveGrade, Classification } from "../../shared/types";

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
  /** The player's own moves are graded automatically; others only when asked. */
  graded: boolean;
  grading?: boolean;
  grade?: MoveGrade;
  gradeError?: string;
  explanation?: Explanation;
  explaining?: boolean;
  explainError?: string;
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
