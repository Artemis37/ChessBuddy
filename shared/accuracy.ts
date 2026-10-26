import type { Classification, Color, MoveGrade } from "./types";

type Graded = Pick<MoveGrade, "mover" | "winBefore" | "winAfter">;

/**
 * A move's accuracy (0-100) from the mover's winning chances before it, with best play, and
 * after it. Lichess's formula, with its one-point bonus for imperfect analysis.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  if (winAfter >= winBefore) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (winBefore - winAfter)) - 3.166924740191411;
  return clamp(raw + 1, 0, 100);
}

/**
 * Each side's accuracy over a game graded from its first move, by Lichess's formula: the average
 * of the move accuracies' harmonic mean, which a few bad moves pull down hard, and a mean that
 * weights moves by how much the winning chances swung around them. Null for a side with no moves.
 * Chess.com's own formula isn't public, so its figures differ.
 */
export function gameAccuracy(grades: Graded[]): Record<Color, number | null> {
  if (grades.length === 0) return { w: null, b: null };
  // White's winning chances in every position of the game, from the start.
  const white = (win: number, side: Color) => (side === "w" ? win : 100 - win);
  const wins = [white(grades[0].winBefore, grades[0].mover), ...grades.map((g) => white(g.winAfter, g.mover))];

  const size = clamp(Math.floor(grades.length / 10), 2, 8);
  const windows = [
    ...Array.from({ length: Math.min(size, wins.length) - 2 }, () => wins.slice(0, size)),
    ...Array.from({ length: Math.max(1, wins.length - size + 1) }, (_, i) => wins.slice(i, i + size)),
  ];
  const weights = windows.map((w) => clamp(standardDeviation(w), 0.5, 12));

  const bySide: Record<Color, { accuracy: number; weight: number }[]> = { w: [], b: [] };
  grades.forEach((g, i) => {
    const mine = (win: number) => white(win, g.mover);
    bySide[g.mover].push({ accuracy: moveAccuracy(mine(wins[i]), mine(wins[i + 1])), weight: weights[i] });
  });

  const side = (moves: { accuracy: number; weight: number }[]) => {
    if (moves.length === 0) return null;
    const weighted = moves.reduce((sum, m) => sum + m.accuracy * m.weight, 0) / moves.reduce((sum, m) => sum + m.weight, 0);
    const harmonic = moves.length / moves.reduce((sum, m) => sum + 1 / Math.max(1, m.accuracy), 0);
    return (weighted + harmonic) / 2;
  };
  return { w: side(bySide.w), b: side(bySide.b) };
}

/** How many moves of each grade each side played. */
export function gradeCounts(grades: Pick<MoveGrade, "mover" | "classification">[]): Record<Color, Record<Classification, number>> {
  const empty = (): Record<Classification, number> => ({
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  });
  const counts = { w: empty(), b: empty() };
  for (const g of grades) counts[g.mover][g.classification]++;
  return counts;
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
