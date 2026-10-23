import { Chess } from "chess.js";
import type { EngineLine, EngineScore } from "../../shared/types";
import type { Analyzer } from "../analysis/grade";
import { strengthFor, type Strength } from "./strength";

const MATE_VALUE = 10_000;

/** Centipawns from the side to move's view, with forced mates far beyond any material edge. */
function centipawns(score: EngineScore): number {
  if (score.mate !== undefined) {
    if (score.mate > 0) return MATE_VALUE - score.mate;
    return -MATE_VALUE - score.mate;
  }
  return score.cp ?? 0;
}

/**
 * Picks the bot's move from the engine's candidate lines. Each candidate is weighted by
 * exp(-loss / temperature), where loss is how many centipawns worse it is than the best
 * line, so higher temperatures make weaker moves likelier. With probability
 * `blunderChance` it ignores the engine and plays any legal move.
 */
export function pickMove(
  lines: EngineLine[],
  legal: string[],
  strength: Strength,
  random: () => number = Math.random,
): string {
  const candidates = lines.filter((line) => line.pv.length > 0 && legal.includes(line.pv[0]));
  if (candidates.length === 0 || random() < strength.blunderChance) {
    return legal[Math.floor(random() * legal.length)];
  }

  const best = centipawns(candidates[0].score);
  const weights = candidates.map((line) => Math.exp(-(best - centipawns(line.score)) / strength.temperature));
  const total = weights.reduce((sum, w) => sum + w, 0);

  let roll = random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll < 0) return candidates[i].pv[0];
  }
  return candidates[candidates.length - 1].pv[0];
}

/** Chooses a move for the bot at an approximate Chess.com rating. Returns null if there is no legal move. */
export async function chooseBotMove(
  engine: Analyzer,
  fen: string,
  rating: number,
  random: () => number = Math.random,
): Promise<string | null> {
  const legal = new Chess(fen).moves({ verbose: true }).map((move) => move.lan);
  if (legal.length === 0) return null;

  const strength = strengthFor(rating);
  const lines = await engine.analyze(fen, { multipv: strength.multipv, depth: strength.depth });
  return pickMove(lines, legal, strength, random);
}
