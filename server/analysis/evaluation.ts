import type { Classification, EngineScore } from "../../shared/types";

/** Winning chances (0-100) for the side the score belongs to, using the Lichess model. */
export function winPercent(score: EngineScore): number {
  if (score.mate !== undefined) return score.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, score.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export function negate(score: EngineScore): EngineScore {
  return score.mate !== undefined ? { mate: -score.mate } : { cp: -(score.cp ?? 0) };
}

export function formatEval(score: EngineScore): string {
  if (score.mate !== undefined) {
    return score.mate < 0 ? `-#${-score.mate}` : `#${score.mate}`;
  }
  const pawns = (score.cp ?? 0) / 100;
  if (pawns === 0) return "0.00";
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

/** Drop thresholds are in winning-chance points (0-100 scale). */
export function classify(winDrop: number, isBest: boolean): Classification {
  if (isBest) return "best";
  if (winDrop < 2) return "excellent";
  if (winDrop < 5) return "good";
  if (winDrop < 10) return "inaccuracy";
  if (winDrop < 20) return "mistake";
  return "blunder";
}
