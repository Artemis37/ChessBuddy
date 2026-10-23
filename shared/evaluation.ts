import type { EngineScore, PositionEval } from "./types";

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

/** Share of the evaluation bar that is White's (0-100). */
export function barFill(position: PositionEval): number {
  if (position.outcome === "white") return 100;
  if (position.outcome === "black") return 0;
  if (position.outcome === "draw") return 50;
  return winPercent(position.score);
}

/** Short label for the evaluation bar, like chess.com's: "0.3", "M3", "1-0". */
export function barLabel(position: PositionEval): string {
  if (position.outcome === "white") return "1-0";
  if (position.outcome === "black") return "0-1";
  if (position.outcome === "draw") return "½-½";
  if (position.score.mate !== undefined) return `M${Math.abs(position.score.mate)}`;
  return Math.abs((position.score.cp ?? 0) / 100).toFixed(1);
}

/** True when White is at least level, so the label sits on White's end of the bar. */
export function whiteIsAhead(position: PositionEval): boolean {
  return barFill(position) >= 50;
}
