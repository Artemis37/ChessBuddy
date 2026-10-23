import { Chess } from "chess.js";
import type { Color, EngineScore, PositionEval } from "../../shared/types";
import type { Analyzer } from "./grade";
import { negate } from "./evaluation";

/** Converts a score from `side`'s point of view to White's. */
export function toWhite(score: EngineScore, side: Color): EngineScore {
  return side === "w" ? score : negate(score);
}

/** How the position stands for White, or the result if the game is already over. */
export async function evaluatePosition(engine: Analyzer, fen: string, depth: number): Promise<PositionEval> {
  const board = new Chess(fen);
  if (board.isCheckmate()) return { score: { mate: 0 }, outcome: board.turn() === "w" ? "black" : "white" };
  if (board.isGameOver()) return { score: { cp: 0 }, outcome: "draw" };

  // Three lines rather than one: grading the next move needs them, and the cache reuses them.
  const [best] = await engine.analyze(fen, { multipv: 3, depth });
  if (!best) throw new Error("Engine returned no analysis for the position");
  return { score: toWhite(best.score, board.turn()) };
}
