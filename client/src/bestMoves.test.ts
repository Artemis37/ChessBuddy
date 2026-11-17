import { afterEach, describe, expect, it, vi } from "vitest";
import type { MoveGrade, SuggestedLine } from "../../shared/types";
import { engineArrows, gradedLines, linesText, loadShowBest, saveShowBest } from "./bestMoves";
import type { PlayedMove } from "./game";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

function suggestion(uci: string, san: string, cp: number): SuggestedLine {
  return { uci, san, eval: "", line: [san], position: { score: { cp } } };
}

const TOP: SuggestedLine[] = [
  suggestion("g1f3", "Nf3", 32),
  suggestion("d2d4", "d4", 25),
  suggestion("e2e4", "e4", -150),
  suggestion("a2a3", "a3", -200),
];

function move(fenBefore: string, bestMoves?: SuggestedLine[]): PlayedMove {
  return {
    id: 1,
    san: "e4",
    uci: "e2e4",
    color: "w",
    fenBefore,
    fenAfter: AFTER_E4,
    graded: true,
    grade: bestMoves && ({ fenBefore, bestMoves } as MoveGrade),
  };
}

describe("engineArrows", () => {
  it("draws the top three moves, each its own color, the best thickest, most opaque and on top", () => {
    // Drawn in order, so the best comes last.
    const arrows = engineArrows(TOP).reverse();
    expect(arrows.map((a) => `${a.from}${a.to}`)).toEqual(["g1f3", "d2d4", "e2e4"]);
    const hues = arrows.map((a) => a.color.replace(/,\s*[\d.]+\)$/, ")"));
    expect(new Set(hues).size).toBe(3);
    const weights = arrows.map((a) => a.weight!);
    expect(weights[0]).toBeGreaterThan(weights[1]);
    expect(weights[1]).toBeGreaterThan(weights[2]);
    const alphas = arrows.map((a) => Number(a.color.match(/([\d.]+)\)$/)![1]));
    expect(alphas[0]).toBeGreaterThan(alphas[1]);
    expect(alphas[1]).toBeGreaterThan(alphas[2]);
  });

  it("draws nothing without moves, as once the game is over", () => {
    expect(engineArrows([])).toEqual([]);
  });
});

describe("linesText", () => {
  it("gives each move's evaluation from White's side, in its arrow's color", () => {
    const arrows = engineArrows(TOP).reverse();
    expect(linesText(TOP)).toEqual([
      { san: "Nf3", eval: "+0.32", color: arrows[0].color },
      { san: "d4", eval: "+0.25", color: arrows[1].color },
      { san: "e4", eval: "-1.50", color: arrows[2].color },
    ]);
  });
});

describe("gradedLines", () => {
  it("knows the top moves in the position before each graded move", () => {
    const lines = gradedLines([[move(START, TOP), move(AFTER_E4)]]);
    expect(lines.get(START)).toBe(TOP);
    // Not graded yet: the arrows will have to ask the engine.
    expect(lines.has(AFTER_E4)).toBe(false);
  });
});

describe("the toggle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is off until turned on, and is remembered", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    expect(loadShowBest()).toBe(false);
    saveShowBest(true);
    expect(loadShowBest()).toBe(true);
    saveShowBest(false);
    expect(loadShowBest()).toBe(false);
  });

  it("stays off when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadShowBest()).toBe(false);
    expect(() => saveShowBest(true)).not.toThrow();
  });
});
