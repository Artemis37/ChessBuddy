import type { Square } from "chess.js";
import { formatEval } from "../../shared/evaluation";
import type { SuggestedLine } from "../../shared/types";
import type { BoardArrow } from "./board/Board";
import type { PlayedMove } from "./game";

const KEY = "chessbuddy.bestMoves";
/** How long the board must stay on a position before the arrows ask the engine for it. */
export const BEST_MOVES_DELAY_MS = 300;

/**
 * The engine's arrows, best move first, each its own color: cyan, green and yellow. Each move
 * down is also a little thinner and fainter, which tells them from the arrows you draw.
 */
const ENGINE_ARROWS = [
  { color: "rgba(0, 214, 255, 0.95)", weight: 1 },
  { color: "rgba(46, 204, 64, 0.9)", weight: 0.78 },
  { color: "rgba(255, 214, 0, 0.85)", weight: 0.6 },
];

/** Whether the best-move arrows are on in this browser; off until turned on. */
export function loadShowBest(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function saveShowBest(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage unavailable: the choice lasts until the page reloads.
  }
}

/** The engine's top moves in each position a grade has analyzed: the position before its move. */
export function gradedLines(lists: PlayedMove[][]): Map<string, SuggestedLine[]> {
  const lines = new Map<string, SuggestedLine[]>();
  for (const list of lists) {
    for (const m of list) if (m.grade) lines.set(m.grade.fenBefore, m.grade.bestMoves);
  }
  return lines;
}

/**
 * Arrows for the engine's top moves, in drawing order: the best last, so it lies on top where two
 * cross or start on the same square. They go under every other arrow.
 */
export function engineArrows(lines: SuggestedLine[]): BoardArrow[] {
  return lines
    .slice(0, ENGINE_ARROWS.length)
    .map((line, i) => ({ from: line.uci.slice(0, 2) as Square, to: line.uci.slice(2, 4) as Square, ...ENGINE_ARROWS[i] }))
    .reverse();
}

/**
 * The top moves as text, each with its evaluation from White's side, as the evaluation bar shows
 * it, and its arrow's color.
 */
export function linesText(lines: SuggestedLine[]): { san: string; eval: string; color: string }[] {
  return lines.slice(0, ENGINE_ARROWS.length).map((line, i) => ({
    san: line.san,
    eval: formatEval(line.position.score),
    color: ENGINE_ARROWS[i].color,
  }));
}
