import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export function pieceName(piece: PieceSymbol): string {
  return NAME[piece];
}

export function opponent(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function toMoveInput(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/** Plays a UCI line from a position and returns it in SAN, stopping at the first illegal move. */
export function sanLine(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of uciMoves) {
    try {
      san.push(chess.move(toMoveInput(uci)).san);
    } catch {
      break;
    }
  }
  return san;
}

/**
 * Material change for `color` (own minus opponent's, pawn = 1) after playing a line.
 * Stops after `maxPlies`, but keeps going while the last move was a capture so an
 * exchange is not cut in half.
 */
export function materialSwing(fen: string, uciMoves: string[], color: Color, maxPlies = 8): number {
  const chess = new Chess(fen);
  const start = materialBalance(chess, color);
  let plies = 0;
  let lastWasCapture = false;
  for (const uci of uciMoves) {
    if (plies >= maxPlies && !lastWasCapture) break;
    try {
      lastWasCapture = Boolean(chess.move(toMoveInput(uci)).captured);
    } catch {
      break;
    }
    plies++;
  }
  return materialBalance(chess, color) - start;
}

function materialBalance(chess: Chess, color: Color): number {
  let balance = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece) balance += piece.color === color ? VALUE[piece.type] : -VALUE[piece.type];
    }
  }
  return balance;
}

/**
 * Pieces of `color` (other than the king) that the opponent attacks and that are either
 * undefended or attacked by a cheaper piece. Most valuable first, at most two.
 */
export function hangingPieces(fen: string, color: Color): string[] {
  const chess = new Chess(fen);
  const enemy = opponent(color);
  const found: { value: number; text: string }[] = [];

  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece || piece.color !== color || piece.type === "k") continue;
      const attackers = chess.attackers(piece.square, enemy);
      if (attackers.length === 0) continue;

      const cheapest = cheapestPiece(chess, attackers);
      const name = NAME[piece.type];
      const by = `the ${NAME[cheapest.type]} on ${cheapest.square}`;
      if (chess.attackers(piece.square, color).length === 0) {
        found.push({
          value: VALUE[piece.type],
          text: `Your ${name} on ${piece.square} is attacked by ${by} and not defended.`,
        });
      } else if (VALUE[cheapest.type] < VALUE[piece.type]) {
        found.push({
          value: VALUE[piece.type],
          text: `Your ${name} on ${piece.square} is attacked by ${by}, a cheaper piece.`,
        });
      }
    }
  }

  return found
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((f) => f.text);
}

function cheapestPiece(chess: Chess, squares: Square[]) {
  return squares
    .map((square) => ({ square, type: chess.get(square)!.type }))
    .sort((a, b) => VALUE[a.type] - VALUE[b.type])[0];
}
