import type { Classification } from "../../shared/types";

export { formatEval, negate, winPercent } from "../../shared/evaluation";

/** Drop thresholds are in winning-chance points (0-100 scale). */
export function classify(winDrop: number, isBest: boolean): Classification {
  if (isBest) return "best";
  if (winDrop < 2) return "excellent";
  if (winDrop < 5) return "good";
  if (winDrop < 10) return "inaccuracy";
  if (winDrop < 20) return "mistake";
  return "blunder";
}
