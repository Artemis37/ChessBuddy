// Types shared by the server API and the React client.

export type Color = "w" | "b";

export type Classification =
  | "best"
  | "excellent"
  | "good"
  | "inaccuracy"
  | "mistake"
  | "blunder";

/** Engine score from the point of view of the side to move. Exactly one field is set. */
export interface EngineScore {
  cp?: number;
  mate?: number;
}

/** One principal variation from the engine, moves in UCI notation (e2e4, e7e8q). */
export interface EngineLine {
  score: EngineScore;
  pv: string[];
}

/** How a position stands, from White's point of view; `outcome` is set when the game is over. */
export interface PositionEval {
  score: EngineScore;
  outcome?: "white" | "black" | "draw";
}

export interface SuggestedLine {
  uci: string;
  san: string;
  /** Evaluation from the mover's point of view, e.g. "+0.45", "#3", "-#2". */
  eval: string;
  /** The line in SAN, starting with this move. */
  line: string[];
}

/** Engine-derived facts about one move. The coach explains moves only from these. */
export interface MoveGrade {
  fenBefore: string;
  fenAfter: string;
  mover: Color;
  played: { uci: string; san: string };
  classification: Classification;
  /** True when the played move was the engine's first choice. */
  isBest: boolean;
  /** Mover's winning chances (0-100) with best play before, and after the played move. */
  winBefore: number;
  winAfter: number;
  winDrop: number;
  evalBefore: string;
  evalAfter: string;
  /** The same evaluations from White's point of view, for the evaluation bar. */
  positionBefore: PositionEval;
  positionAfter: PositionEval;
  /** Engine's top moves in the position before the move (up to 3). */
  bestMoves: SuggestedLine[];
  /** Opponent's best reply line after the played move, in SAN. Empty when the game ended. */
  opponentReply: string[];
  /** Plain-language facts computed by code (hanging pieces, material swings, mates). */
  motifs: string[];
}

export interface Explanation {
  verdict: string;
  why: string;
  betterMove: string;
  /** The best reply to the move and its point. */
  reply: string;
  lesson: string;
  /** Model that wrote the explanation. */
  model: string;
}

/** Whose move is being explained, from the player's point of view. */
export type Perspective = "mine" | "opponent";

export const COACH_MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "balanced" },
  { id: "claude-opus-5-5", label: "Opus 5.5", note: "most thorough, slower" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5", note: "fastest, cheapest" },
] as const;

export type CoachModelId = (typeof COACH_MODELS)[number]["id"];

export function coachModelLabel(id: string): string {
  return COACH_MODELS.find((m) => m.id === id)?.label ?? id;
}

export interface BotMoveResponse {
  uci: string;
  san: string;
}

export interface StatusResponse {
  engine: { ready: boolean; error?: string };
  coach: { ready: boolean; defaultModel: string; error?: string };
}

/** Bot strength: an approximate Chess.com rating, or full-strength Stockfish. */
export type BotRating = number | "max";

export const BOT_RATINGS: BotRating[] = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, "max"];

export function botRatingLabel(rating: BotRating): string {
  return rating === "max" ? "Maximum (full Stockfish)" : `${rating}`;
}
