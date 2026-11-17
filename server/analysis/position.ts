import { Chess } from "chess.js";
import type { Color, EngineLine, EngineScore, PositionAnalysis, SuggestedLine } from "../../shared/types";
import type { Analyzer } from "./grade";
import { formatEval, negate } from "./evaluation";
import { sanLine } from "./motifs";

/** How many moves of each engine line are given in SAN. */
const LINE_PLIES = 8;
/** Engine lines asked for in a position: grading the next move needs three, and the best-move arrows show them. */
export const POSITION_LINES = 3;

/** Converts a score from `side`'s point of view to White's. */
export function toWhite(score: EngineScore, side: Color): EngineScore {
  return side === "w" ? score : negate(score);
}

/** The engine's lines in a position, as moves the side to move (`mover`) could play, best first. */
export function suggestedLines(fen: string, lines: EngineLine[], mover: Color): SuggestedLine[] {
  return lines
    .filter((line) => line.pv.length > 0)
    .map((line) => ({
      uci: line.pv[0],
      san: sanLine(fen, line.pv.slice(0, 1))[0],
      eval: formatEval(line.score),
      line: sanLine(fen, line.pv.slice(0, LINE_PLIES)),
      position: { score: toWhite(line.score, mover) },
    }));
}

/**
 * How the position stands for White, or the result if the game is already over, with the
 * engine's top moves for the side to move.
 */
export async function evaluatePosition(engine: Analyzer, fen: string, depth: number): Promise<PositionAnalysis> {
  const board = new Chess(fen);
  if (board.isCheckmate()) return { score: { mate: 0 }, outcome: board.turn() === "w" ? "black" : "white", bestMoves: [] };
  if (board.isGameOver()) return { score: { cp: 0 }, outcome: "draw", bestMoves: [] };

  // Three lines rather than one: grading the next move needs them, the cache reuses them, and the
  // best-move arrows show them.
  const lines = await engine.analyze(fen, { multipv: POSITION_LINES, depth });
  if (!lines[0]) throw new Error("Engine returned no analysis for the position");
  return { score: toWhite(lines[0].score, board.turn()), bestMoves: suggestedLines(fen, lines, board.turn()) };
}
