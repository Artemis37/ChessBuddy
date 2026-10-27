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
  /** The same evaluation from White's point of view, for the evaluation bar. */
  position: PositionEval;
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

/** One step of an explanation: a sentence, and the moves the board plays to show it. */
export interface ExplanationStep {
  caption: string;
  /** Position the board starts the step from. */
  fen: string;
  /** Moves the board plays, in order. Taken from the engine's lines, never written by the coach. */
  moves: { uci: string; san: string }[];
  /** Drawn once the moves are played: attacks and threats, checked against that position. */
  arrows: { from: string; to: string }[];
  /** Squares outlined once the moves are played, such as a hanging piece. */
  marks: string[];
  /** Evaluation at the end of the step, from White's point of view. */
  evaluation: PositionEval;
}

export interface Explanation {
  /** One short sentence: the main point about the move. */
  summary: string;
  steps: ExplanationStep[];
  lesson: string;
  /** Model that wrote the explanation. */
  model: string;
}

/** The coach's answer to a follow-up question about an explained move. */
export interface CoachReply {
  answer: string;
  /** Moves that show the answer on the board; may be empty. */
  steps: ExplanationStep[];
  model: string;
}

/** An earlier question and its answer, sent back so the next answer can build on them. */
export interface FollowUp {
  question: string;
  answer: string;
  /** Captions of the answer's steps. */
  steps: string[];
}

/** Whose move is being explained, from the player's point of view. */
export type Perspective = "mine" | "opponent";

/** When the player is learning an opening: what an explanation needs to know about it. */
export interface OpeningContext {
  /** The line being learned, such as "Sicilian Defense: Najdorf Variation". */
  studying: string;
  /** The opening the position after the move belongs to, if it has a name. */
  reached: string | null;
  /** True when the move is in the opening book. */
  bookMove: boolean;
  /** The book's moves in the position before the move, in SAN, most-studied first. */
  bookMoves: string[];
  /** How the line being learned goes on from the position before the move, in SAN; empty once off it. */
  line: string[];
}

/** `vip`: only VIP accounts may use the model; the server refuses it to others. */
export const COACH_MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "balanced", vip: false },
  { id: "claude-opus-5-5", label: "Opus 5.5", note: "most thorough, slower", vip: true },
  { id: "claude-haiku-5-5", label: "Haiku 5.5", note: "fastest, cheapest", vip: false },
] as const;

export type CoachModelId = (typeof COACH_MODELS)[number]["id"];

export function coachModelLabel(id: string): string {
  return COACH_MODELS.find((m) => m.id === id)?.label ?? id;
}

/** True when only VIP accounts may use the model. */
export function isVipModel(id: string): boolean {
  return COACH_MODELS.some((m) => m.id === id && m.vip);
}

export interface BotMoveResponse {
  uci: string;
  san: string;
}

export interface StatusResponse {
  engine: { ready: boolean; error?: string };
  coach: { ready: boolean; defaultModel: string; error?: string };
}

/** The signed-in account, from /api/auth/login and /api/auth/me. */
export interface SessionResponse {
  username: string;
  /** VIP accounts may use every coach model, Opus included. */
  vip: boolean;
}

/** Bot strength: an approximate Chess.com rating, or full-strength Stockfish. */
export type BotRating = number | "max";

export const BOT_RATINGS: BotRating[] = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600, "max"];

export function botRatingLabel(rating: BotRating): string {
  return rating === "max" ? "Maximum (full Stockfish)" : `${rating}`;
}
