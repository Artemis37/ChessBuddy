import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../shared/types";
import { gradeMove, type Analyzer } from "./grade";

// 1.e4 e5 2.Nf3 Nc6, White to move
const ITALIAN_START = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

/** Fake engine that answers from a FEN -> lines table. */
function fakeEngine(table: Record<string, EngineLine[]>): Analyzer {
  return {
    async analyze(fen) {
      const lines = table[fen];
      if (!lines) throw new Error(`no analysis for ${fen}`);
      return lines;
    },
  };
}

const beforeLines: EngineLine[] = [
  { score: { cp: 40 }, pv: ["f1b5", "a7a6", "b5a4"] },
  { score: { cp: 32 }, pv: ["f1c4", "g8f6"] },
  { score: { cp: 28 }, pv: ["d2d4", "e5d4"] },
];

describe("gradeMove", () => {
  it("grades the engine's first choice as best", async () => {
    const afterBb5 = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
    const engine = fakeEngine({
      [ITALIAN_START]: beforeLines,
      [afterBb5]: [{ score: { cp: -38 }, pv: ["a7a6", "b5a4"] }],
    });

    const grade = await gradeMove(engine, ITALIAN_START, "f1b5", 16);

    expect(grade.classification).toBe("best");
    expect(grade.played).toEqual({ uci: "f1b5", san: "Bb5" });
    expect(grade.mover).toBe("w");
    expect(grade.evalBefore).toBe("+0.40");
    expect(grade.evalAfter).toBe("+0.38");
    expect(grade.positionBefore).toEqual({ score: { cp: 40 } });
    expect(grade.positionAfter).toEqual({ score: { cp: 38 } });
    expect(grade.bestMoves.map((m) => m.san)).toEqual(["Bb5", "Bc4", "d4"]);
    expect(grade.bestMoves[0].line).toEqual(["Bb5", "a6", "Ba4"]);
    expect(grade.bestMoves[1].position).toEqual({ score: { cp: 32 } });
    expect(grade.opponentReply).toEqual(["a6", "Ba4"]);
    expect(grade.motifs).toEqual([]);
  });

  it("grades a piece-losing capture as a blunder and explains the material loss", async () => {
    const afterNxe5 = "r1bqkbnr/pppp1ppp/2n5/4N3/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 3";
    const engine = fakeEngine({
      [ITALIAN_START]: beforeLines,
      [afterNxe5]: [{ score: { cp: 230 }, pv: ["c6e5", "d2d4", "e5c6"] }],
    });

    const grade = await gradeMove(engine, ITALIAN_START, "f3e5", 16);

    expect(grade.classification).toBe("blunder");
    expect(grade.isBest).toBe(false);
    expect(grade.evalAfter).toBe("-2.30");
    expect(grade.winDrop).toBeGreaterThan(20);
    expect(grade.opponentReply).toEqual(["Nxe5", "d4", "Nc6"]);
    expect(grade.motifs).toContain("The opponent's best reply Nxe5 captures your knight on e5.");
    expect(grade.motifs).toContain(
      "If the opponent follows the engine line, you end up 2 points of material down compared with before your move (pawn 1, knight/bishop 3, rook 5, queen 9).",
    );
  });

  it("treats a mating move as best without analysing the final position", async () => {
    // Fool's mate setup: 1.f3 e5 2.g4, Black to move plays Qh4#.
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2";
    const engine = fakeEngine({ [fen]: [{ score: { mate: 1 }, pv: ["d8h4"] }] });

    const grade = await gradeMove(engine, fen, "d8h4", 16);

    expect(grade.classification).toBe("best");
    expect(grade.evalAfter).toBe("#");
    expect(grade.winAfter).toBe(100);
    // Black delivered mate, so from White's side the game is lost.
    expect(grade.positionBefore).toEqual({ score: { mate: -1 } });
    expect(grade.positionAfter).toEqual({ score: { mate: 0 }, outcome: "black" });
    expect(grade.motifs).toEqual(["Your move is checkmate."]);
  });

  it("flags a missed forced mate", async () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2";
    const afterNc6 = "r1bqkbnr/pppp1ppp/2n5/4p3/6P1/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
    const engine = fakeEngine({
      [fen]: [{ score: { mate: 1 }, pv: ["d8h4"] }],
      [afterNc6]: [{ score: { cp: 150 }, pv: ["e2e4"] }],
    });

    const grade = await gradeMove(engine, fen, "b8c6", 16);

    expect(grade.classification).toBe("blunder");
    expect(grade.motifs).toContain("You had a forced checkmate in 1, starting with Qh4#.");
  });

  it("rejects an illegal move", async () => {
    const engine = fakeEngine({ [ITALIAN_START]: beforeLines });
    await expect(gradeMove(engine, ITALIAN_START, "e1e3", 16)).rejects.toThrow();
  });
});
