import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { MoveGrade } from "../../shared/types";
import { boardLines, buildSteps, MAX_STEPS, supportsArrow, tryMoves, type StepPlan } from "./walkthrough";

// 1.e4 e5 2.Bc4 Nc6 3.Qh5, Black to move; 3... Nf6?? allows 4. Qxf7#.
const BEFORE = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
const AFTER = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

const GRADE: MoveGrade = {
  fenBefore: BEFORE,
  fenAfter: AFTER,
  mover: "b",
  played: { uci: "g8f6", san: "Nf6" },
  classification: "blunder",
  isBest: false,
  winBefore: 46,
  winAfter: 0,
  winDrop: 46,
  evalBefore: "-0.40",
  evalAfter: "-#1",
  positionBefore: { score: { cp: 40 } },
  positionAfter: { score: { mate: 1 } },
  bestMoves: [
    { uci: "g7g6", san: "g6", eval: "-0.30", line: ["g6", "Qf3", "Nf6"], position: { score: { cp: 30 } } },
    { uci: "d8e7", san: "Qe7", eval: "-0.35", line: ["Qe7"], position: { score: { cp: 35 } } },
  ],
  opponentReply: ["Qxf7#"],
  motifs: [],
};

function plan(overrides: Partial<StepPlan>): StepPlan {
  return { caption: "A step.", line: "played", fromMove: 1, toMove: 1, arrows: [], marks: [], ...overrides };
}

describe("buildSteps", () => {
  it("plays the engine's moves for each step, from where the step starts", () => {
    const steps = buildSteps(boardLines(GRADE), [
      plan({ caption: " Nf6 leaves f7 to the king. ", fromMove: 1, toMove: 1 }),
      plan({ fromMove: 2, toMove: 2 }),
      plan({ line: "best1", fromMove: 1, toMove: 3 }),
    ]);

    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({
      caption: "Nf6 leaves f7 to the king.",
      fen: BEFORE,
      moves: [{ uci: "g8f6", san: "Nf6" }],
      evaluation: { score: { mate: 1 } },
    });
    // The reply step starts after the played move.
    expect(steps[1].fen).toBe(AFTER);
    expect(steps[1].moves).toEqual([{ uci: "h5f7", san: "Qxf7#" }]);
    expect(steps[2].fen).toBe(BEFORE);
    expect(steps[2].moves.map((m) => m.uci)).toEqual(["g7g6", "h5f3", "g8f6"]);
    expect(steps[2].evaluation).toEqual({ score: { cp: 30 } });
  });

  it("shows a checkmate at the end of a step as the result", () => {
    const [step] = buildSteps(boardLines(GRADE), [plan({ fromMove: 1, toMove: 2 })]);
    expect(step.evaluation).toEqual({ score: { mate: 0 }, outcome: "white" });
  });

  it("drops steps with an unknown line or no moves, and stops at the end of a line", () => {
    const steps = buildSteps(boardLines(GRADE), [
      plan({ line: "best3" }),
      plan({ fromMove: 3, toMove: 4 }),
      plan({ fromMove: 2, toMove: 1 }),
      plan({ line: "best2", fromMove: 1, toMove: 5 }),
    ]);
    expect(steps).toHaveLength(1);
    expect(steps[0].moves).toEqual([{ uci: "d8e7", san: "Qe7" }]);
  });

  it("keeps only arrows the position supports", () => {
    const [step] = buildSteps(boardLines(GRADE), [
      plan({
        arrows: [
          { from: "h5", to: "f7" }, // the queen attacks f7
          { from: "c4", to: "f7" }, // so does the bishop
          { from: "e3", to: "e4" }, // empty square
          { from: "c4", to: "c6" }, // not a bishop move
        ],
      }),
    ]);
    expect(step.arrows).toEqual([
      { from: "h5", to: "f7" },
      { from: "c4", to: "f7" },
    ]);
  });

  it("keeps marks that are squares, once each", () => {
    const [step] = buildSteps(boardLines(GRADE), [plan({ marks: ["f7", "f7", "z9", "e8"] })]);
    expect(step.marks).toEqual(["f7", "e8"]);
  });

  it(`shows at most ${MAX_STEPS} steps`, () => {
    expect(buildSteps(boardLines(GRADE), Array.from({ length: 6 }, () => plan({})))).toHaveLength(MAX_STEPS);
  });
});

describe("supportsArrow", () => {
  const board = new Chess(AFTER);

  it("accepts a quiet move of the side not to move, such as a pawn push", () => {
    expect(supportsArrow(board, { from: "d7", to: "d5" })).toBe(true);
  });

  it("accepts a piece defending its own piece", () => {
    expect(supportsArrow(board, { from: "f6", to: "h5" })).toBe(true);
    expect(supportsArrow(board, { from: "d1", to: "d2" })).toBe(false); // d1 is empty
  });
});

describe("buildSteps with moves named in captions", () => {
  // 3... g6 4. Qf3 Nf6 5. d3 d6
  const lines = {
    long: { fen: BEFORE, moves: ["g6", "Qf3", "Nf6", "d3", "d6"], evaluation: { score: { cp: 30 } } },
  };

  it("also plays a later move the caption names with its number", () => {
    const [step] = buildSteps(lines, [plan({ line: "long", caption: "3... g6 first, then 5... d6.", toMove: 1 })]);
    expect(step.moves.map((m) => m.san)).toEqual(["g6", "Qf3", "Nf6", "d3", "d6"]);
  });

  it("also plays a later piece move named without a number", () => {
    const [step] = buildSteps(lines, [plan({ line: "long", caption: "g6 blocks the queen, so Nf6 is safe.", toMove: 1 })]);
    expect(step.moves.map((m) => m.san)).toEqual(["g6", "Qf3", "Nf6"]);
  });

  it("doesn't read a bare square name as a pawn move", () => {
    const [step] = buildSteps(lines, [plan({ line: "long", caption: "g6 keeps an eye on d3.", toMove: 1 })]);
    expect(step.moves.map((m) => m.san)).toEqual(["g6"]);
  });

  it("plays the mate when the caption already names it", () => {
    const [step] = buildSteps(boardLines(GRADE), [plan({ caption: "Nf6 allows 4. Qxf7#.", toMove: 1 })]);
    expect(step.moves.map((m) => m.san)).toEqual(["Nf6", "Qxf7#"]);
  });
});

describe("tryMoves", () => {
  // After 3... Qf6 the engine answers 4. Nc3, scoring +0.20 for White (the side to move).
  const engine = async () => [{ score: { cp: 20 }, pv: ["b1c3", "g8e7"] }];

  it("plays the moves, lets the engine continue, and adds the line", async () => {
    const lines = boardLines(GRADE);
    const result = await tryMoves(lines, { line: "played", afterMove: 0, moves: ["3... Qf6"] }, "b", engine);
    expect(result).toEqual({
      id: "try1",
      line: { fen: BEFORE, moves: ["Qf6", "Nc3", "Nge7"], evaluation: { score: { cp: 20 } } },
      firstTried: 1,
      lastTried: 1,
      evaluation: "-0.20",
    });
    expect(lines.try1).toBe((result as { line: unknown }).line);
    // Steps can use the new line.
    const [step] = buildSteps(lines, [plan({ line: "try1", toMove: 2 })]);
    expect(step.moves.map((m) => m.san)).toEqual(["Qf6", "Nc3"]);
  });

  it("branches partway into a line and reports a mate without asking the engine", async () => {
    let asked = false;
    const result = await tryMoves(
      boardLines(GRADE),
      { line: "played", afterMove: 1, moves: ["Qxf7#"] },
      "b",
      async () => {
        asked = true;
        return [];
      },
    );
    expect(asked).toBe(false);
    expect(result).toMatchObject({
      line: { moves: ["Nf6", "Qxf7#"], evaluation: { score: { mate: 0 }, outcome: "white" } },
      firstTried: 2,
      lastTried: 2,
      evaluation: "checkmate, white wins",
    });
  });

  it("explains illegal moves and unknown lines", async () => {
    const lines = boardLines(GRADE);
    const illegal = await tryMoves(lines, { line: "played", afterMove: 0, moves: ["Qxf7"] }, "b", engine);
    expect(illegal).toMatchObject({ error: expect.stringMatching(/^Qxf7 isn't legal in that position. Legal moves: .*Nf6/) });
    const unknown = await tryMoves(lines, { line: "best9", afterMove: 0, moves: ["g6"] }, "b", engine);
    expect(unknown).toEqual({ error: 'There is no board line "best9". Use one of: played, best1, best2.' });
    expect(Object.keys(lines)).toEqual(["played", "best1", "best2"]);
  });
});
