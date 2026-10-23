import { Chess } from "chess.js";
import type { EngineLine, EngineScore, MoveGrade, PositionEval } from "../../shared/types";
import { classify, formatEval, negate, winPercent } from "./evaluation";
import { hangingPieces, materialSwing, pieceName, sanLine, toMoveInput } from "./motifs";
import { toWhite } from "./position";

export interface Analyzer {
  analyze(fen: string, options: { multipv: number; depth: number }): Promise<EngineLine[]>;
}

const LINE_PLIES = 8;
const MATERIAL_NOTE_THRESHOLD = 2;

/** Grades one move with the engine and gathers the facts the coach is allowed to use. */
export async function gradeMove(engine: Analyzer, fenBefore: string, uci: string, depth: number): Promise<MoveGrade> {
  const board = new Chess(fenBefore);
  const mover = board.turn();
  const move = board.move(toMoveInput(uci)); // throws on an illegal move
  const fenAfter = board.fen();
  const checkmate = board.isCheckmate();
  const gameOver = board.isGameOver();

  const [before, after] = await Promise.all([
    engine.analyze(fenBefore, { multipv: 3, depth }),
    gameOver ? Promise.resolve([]) : engine.analyze(fenAfter, { multipv: 1, depth }),
  ]);
  if (before.length === 0) throw new Error("Engine returned no analysis for the position");

  const bestScore = before[0].score;
  // The engine scores the position after the move from the opponent's side.
  const afterScore: EngineScore | null = gameOver ? null : negate(after[0].score);

  const isBest = checkmate || before[0].pv[0] === uci;
  const winBefore = winPercent(bestScore);
  const winAfter = checkmate ? 100 : afterScore ? winPercent(afterScore) : 50;
  const winDrop = Math.max(0, winBefore - winAfter);
  const opponentLine = gameOver ? [] : after[0].pv;
  const positionAfter: PositionEval = checkmate
    ? { score: { mate: 0 }, outcome: mover === "w" ? "white" : "black" }
    : afterScore
      ? { score: toWhite(afterScore, mover) }
      : { score: { cp: 0 }, outcome: "draw" };

  const grade: MoveGrade = {
    fenBefore,
    fenAfter,
    mover,
    played: { uci, san: move.san },
    classification: classify(winDrop, isBest),
    isBest,
    winBefore: round(winBefore),
    winAfter: round(winAfter),
    winDrop: round(winDrop),
    evalBefore: formatEval(bestScore),
    evalAfter: checkmate ? "#" : afterScore ? formatEval(afterScore) : "0.00",
    positionBefore: { score: toWhite(bestScore, mover) },
    positionAfter,
    bestMoves: before
      .filter((line) => line.pv.length > 0)
      .map((line) => ({
        uci: line.pv[0],
        san: sanLine(fenBefore, line.pv.slice(0, 1))[0],
        eval: formatEval(line.score),
        line: sanLine(fenBefore, line.pv.slice(0, LINE_PLIES)),
      })),
    opponentReply: sanLine(fenAfter, opponentLine.slice(0, LINE_PLIES)),
    motifs: [],
  };

  grade.motifs = collectMotifs(grade, { board, before, afterScore, opponentLine, checkmate, gameOver });
  return grade;
}

function collectMotifs(
  grade: MoveGrade,
  ctx: {
    board: Chess;
    before: EngineLine[];
    afterScore: EngineScore | null;
    opponentLine: string[];
    checkmate: boolean;
    gameOver: boolean;
  },
): string[] {
  const motifs: string[] = [];
  const { mover, fenBefore, fenAfter, played } = grade;
  const best = grade.bestMoves[0];
  const bestScore = ctx.before[0].score;

  if (ctx.checkmate) return ["Your move is checkmate."];
  if (ctx.gameOver) motifs.push("Your move ends the game in a draw.");

  if (bestScore.mate !== undefined && bestScore.mate > 0 && !(ctx.afterScore?.mate && ctx.afterScore.mate > 0)) {
    motifs.push(`You had a forced checkmate in ${bestScore.mate}, starting with ${best.san}.`);
  }
  if (ctx.afterScore?.mate !== undefined && ctx.afterScore.mate < 0) {
    motifs.push(`After your move the opponent can force checkmate in ${-ctx.afterScore.mate}.`);
  }

  const reply = ctx.opponentLine[0];
  if (reply) {
    const replyMove = new Chess(fenAfter).move(toMoveInput(reply));
    if (replyMove.captured) {
      motifs.push(
        `The opponent's best reply ${replyMove.san} captures your ${pieceName(replyMove.captured)} on ${replyMove.to}.`,
      );
    }
  }

  const weak = grade.classification === "inaccuracy" || grade.classification === "mistake" || grade.classification === "blunder";
  if (weak) {
    motifs.push(...hangingPieces(fenAfter, mover));

    const afterLine = [played.uci, ...ctx.opponentLine];
    const lost = materialSwing(fenBefore, afterLine, mover);
    if (lost <= -MATERIAL_NOTE_THRESHOLD) {
      motifs.push(
        `If the opponent follows the engine line, you end up ${-lost} points of material down compared with before your move (pawn 1, knight/bishop 3, rook 5, queen 9).`,
      );
    }

    if (best && best.uci !== played.uci) {
      const gained = materialSwing(fenBefore, ctx.before[0].pv, mover);
      if (gained >= MATERIAL_NOTE_THRESHOLD) {
        motifs.push(`The engine's best move ${best.san} wins about ${gained} points of material along its line.`);
      }
    }
  }

  if (ctx.board.isCheck() && !ctx.checkmate) motifs.push("Your move gives check.");
  return motifs;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
