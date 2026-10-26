import { Chess, type Move, type Square } from "chess.js";
import type { Color } from "../../../shared/types";

/** The sounds a move can make, after chess.com's: one per kind of move, and one for the end of the game. */
export type MoveSound = "move" | "opponent" | "capture" | "castle" | "check" | "promote" | "gameEnd";

/**
 * The sound of a move, from its chess.js flags and the position after it. The most telling one
 * wins: the end of the game (checkmate, stalemate or a draw), then check, promotion, castling and
 * a capture. A quiet move by `opponent` (the bot) sounds different from your own, as on chess.com.
 */
export function moveSound(
  move: Pick<Move, "color" | "flags" | "captured" | "promotion">,
  after: Pick<Chess, "isCheck" | "isGameOver">,
  opponent: Color | null = null,
): MoveSound {
  if (after.isGameOver()) return "gameEnd";
  if (after.isCheck()) return "check";
  if (move.promotion) return "promote";
  if (move.flags.includes("k") || move.flags.includes("q")) return "castle";
  if (move.captured) return "capture";
  return move.color === opponent ? "opponent" : "move";
}

/**
 * The sound of the last of `ucis`, played from `fen` (the starting position by default). The
 * moves before it count, so a threefold repetition ends the game. Null when there are no moves.
 */
export function lastMoveSound(ucis: string[], opponent: Color | null = null, fen?: string): MoveSound | null {
  const board = new Chess(fen);
  let last: Move | undefined;
  for (const uci of ucis) {
    last = board.move({ from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] });
  }
  return last ? moveSound(last, board, opponent) : null;
}

/**
 * The sound of stepping through a game's moves from the position after `from` moves to the one
 * after `to`: going forward, the last move shown makes its own sound; going back, the pieces
 * just slide back, which sounds like a quiet move. Null when the position doesn't change.
 */
export function stepSound(ucis: string[], from: number, to: number, opponent: Color | null = null): MoveSound | null {
  if (to > from) return lastMoveSound(ucis.slice(0, to), opponent);
  return to < from ? "move" : null;
}
