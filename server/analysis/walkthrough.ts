import { Chess, type Color, type Square } from "chess.js";
import { formatEval, negate } from "../../shared/evaluation";
import { numberedMoves } from "../../shared/notation";
import type { EngineLine, ExplanationStep, MoveGrade, PositionEval } from "../../shared/types";
import { sanLine } from "./motifs";
import { toWhite } from "./position";

/** A step as the coach plans it: which board line to play, how far, and what to draw. */
export interface StepPlan {
  caption: string;
  line: string;
  /** First and last move of the line to play, counting from 1. */
  fromMove: number;
  toMove: number;
  arrows: { from: string; to: string }[];
  marks: string[];
}

/** A line of moves the coach may show on the board. */
export interface BoardLine {
  /** Position the line starts from. */
  fen: string;
  moves: string[];
  /** Evaluation of the line from White's point of view. */
  evaluation: PositionEval;
}

/** The engine's best lines for a position, from the side to move. */
export type LineEngine = (fen: string) => Promise<EngineLine[]>;

/** What the coach asks for with the try_moves tool. */
export interface TryMovesInput {
  /** Board line to branch from. */
  line: string;
  /** How many of that line's moves to play before the tried moves. */
  afterMove: number;
  moves: string[];
}

export type TryMovesResult =
  | { id: string; line: BoardLine; firstTried: number; lastTried: number; evaluation: string }
  | { error: string };

export const MAX_STEPS = 4;
const MAX_ARROWS = 2;
const MAX_MARKS = 2;
/** How many engine moves follow the tried moves. */
const TRY_CONTINUATION_PLIES = 6;
/** How far past a step's last move a move named in its caption may be and still be added. */
const MENTION_WINDOW = 6;

/**
 * The lines the coach can show: "played" is the move followed by the engine's best play
 * after it, and "best1".."best3" are the engine's top moves in the position before it.
 */
export function boardLines(grade: MoveGrade): Record<string, BoardLine> {
  const lines: Record<string, BoardLine> = {
    played: {
      fen: grade.fenBefore,
      moves: [grade.played.san, ...grade.opponentReply],
      evaluation: grade.positionAfter,
    },
  };
  grade.bestMoves.forEach((best, i) => {
    lines[`best${i + 1}`] = { fen: grade.fenBefore, moves: best.line, evaluation: best.position };
  });
  return lines;
}

/**
 * Plays moves the coach wants to show from a point in a board line, lets the engine continue
 * with best play, and adds the result to `lines` as a new line ("try1", "try2", ...). The new
 * line starts where its base line starts, so move numbers carry over. Evaluations in the
 * result are from `mover`'s side, like the rest of the facts the coach gets.
 */
export async function tryMoves(
  lines: Record<string, BoardLine>,
  input: TryMovesInput,
  mover: Color,
  engine: LineEngine,
): Promise<TryMovesResult> {
  const base = lines[input.line];
  if (!base) return { error: `There is no board line "${input.line}". Use one of: ${Object.keys(lines).join(", ")}.` };
  const after = Math.floor(input.afterMove);
  if (after < 0 || after > base.moves.length) {
    return { error: `afterMove must be from 0 to ${base.moves.length} for the line "${input.line}".` };
  }
  if (input.moves.length === 0) return { error: "Give at least one move to try." };

  const board = new Chess(base.fen);
  for (const san of base.moves.slice(0, after)) board.move(san);
  const tried: string[] = [];
  for (const raw of input.moves) {
    if (board.isGameOver()) break;
    const san = raw.replace(/^\d+\.(\.\.)?\s*/, "").trim();
    try {
      tried.push(board.move(san).san);
    } catch {
      return { error: `${san} isn't legal in that position. Legal moves: ${board.moves().join(", ")}.` };
    }
  }

  let continuation: string[] = [];
  let evaluation = gameResult(board);
  let described: string;
  if (evaluation) {
    described = evaluation.outcome === "draw" ? "draw" : `checkmate, ${evaluation.outcome} wins`;
  } else {
    const [best] = await engine(board.fen());
    if (!best) return { error: "The engine returned no analysis for that position." };
    continuation = sanLine(board.fen(), best.pv.slice(0, TRY_CONTINUATION_PLIES));
    evaluation = { score: toWhite(best.score, board.turn()) };
    described = formatEval(board.turn() === mover ? best.score : negate(best.score));
  }

  const id = `try${Object.keys(lines).filter((key) => key.startsWith("try")).length + 1}`;
  const line: BoardLine = { fen: base.fen, moves: [...base.moves.slice(0, after), ...tried, ...continuation], evaluation };
  lines[id] = line;
  return { id, line, firstTried: after + 1, lastTried: after + tried.length, evaluation: described };
}

/**
 * Turns the coach's plans into steps the board can play. The moves come from the board lines;
 * a step naming a missing line or no moves is dropped, a step whose caption names later moves
 * of its line plays them too, and arrows and marks the position doesn't support are left out.
 */
export function buildSteps(lines: Record<string, BoardLine>, plans: StepPlan[]): ExplanationStep[] {
  const steps: ExplanationStep[] = [];

  for (const plan of plans) {
    const line = lines[plan.line];
    if (!line) continue;
    const first = Math.max(1, Math.floor(plan.fromMove));
    const last = Math.min(line.moves.length, lastNamedMove(plan.caption, line, Math.floor(plan.toMove)));
    if (last < first) continue;

    const board = new Chess(line.fen);
    let fen = line.fen;
    const moves: ExplanationStep["moves"] = [];
    try {
      for (let i = 0; i < last; i++) {
        if (i === first - 1) fen = board.fen();
        const move = board.move(line.moves[i]);
        if (i >= first - 1) moves.push({ uci: move.lan, san: move.san });
      }
    } catch {
      // The line doesn't fit the position; show the moves that did.
    }
    if (moves.length === 0) continue;

    steps.push({
      caption: plan.caption.trim(),
      fen,
      moves,
      arrows: plan.arrows.filter((arrow) => supportsArrow(board, arrow)).slice(0, MAX_ARROWS),
      marks: [...new Set(plan.marks.filter(isSquare))].slice(0, MAX_MARKS),
      evaluation: gameResult(board) ?? line.evaluation,
    });
    if (steps.length === MAX_STEPS) break;
  }
  return steps;
}

function plainSan(san: string): string {
  return san.replace(/[+#!?]+$/, "");
}

/**
 * The step's last move, pushed later when the caption names moves that come soon after it in
 * the same line, so every move the caption talks about is also played on the board.
 */
function lastNamedMove(caption: string, line: BoardLine, last: number): number {
  const labels = numberedMoves(line.fen, line.moves).map(plainSan);
  const plain = line.moves.map(plainSan);
  const inWindow = (index: number) => index >= last && index < last + MENTION_WINDOW;
  let end = last;
  // Numbered moves ("4... Bg7") point at one move exactly.
  for (const m of caption.matchAll(/\b(\d+)\.(\.\.)?\s*(O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)/g)) {
    const index = labels.indexOf(`${m[1]}${m[2] ? "..." : "."} ${m[3]}`);
    if (inWindow(index)) end = Math.max(end, index + 1);
  }
  // Unnumbered piece moves and castling ("then Bg7"); bare pawn moves look like square names, so they need a number.
  for (const m of caption.matchAll(/(?<![\w.])(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)/g)) {
    const index = plain.findIndex((san, i) => inWindow(i) && san === m[1]);
    if (index >= 0) end = Math.max(end, index + 1);
  }
  return end;
}

function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

/** True when a piece stands on `from` and attacks `to`, or could move there on its turn. */
export function supportsArrow(board: Chess, { from, to }: { from: string; to: string }): boolean {
  if (!isSquare(from) || !isSquare(to) || from === to) return false;
  const piece = board.get(from);
  if (!piece) return false;
  if (board.attackers(to, piece.color).includes(from)) return true;
  // Quiet moves such as pawn pushes: ask as if it were that side's turn.
  const fields = board.fen().split(" ");
  fields[1] = piece.color;
  fields[3] = "-";
  try {
    return new Chess(fields.join(" ")).moves({ square: from, verbose: true }).some((m) => m.to === to);
  } catch {
    return false;
  }
}

/** The result when the game is over in this position, otherwise null. */
function gameResult(board: Chess): PositionEval | null {
  if (board.isCheckmate()) return { score: { mate: 0 }, outcome: board.turn() === "w" ? "black" : "white" };
  if (board.isStalemate() || board.isInsufficientMaterial() || board.isDraw()) {
    return { score: { cp: 0 }, outcome: "draw" };
  }
  return null;
}
