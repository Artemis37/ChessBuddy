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
  fenBefore: string;
  fenAfter: string;
  /** Only the player's own color is graded. */
  graded: boolean;
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
