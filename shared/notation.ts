/**
 * Writes a SAN line with move numbers, starting from the position in `fen`:
 * "2... Nxa6 3. d4 b5". The numbers make clear which side plays each move.
 */
export function numberedLine(fen: string, san: string[]): string {
  const [, side, , , , fullmove] = fen.split(" ");
  let number = Number(fullmove) || 1;
  let whiteToMove = side !== "b";
  const parts: string[] = [];

  san.forEach((move, i) => {
    if (whiteToMove) parts.push(`${number}. ${move}`);
    else parts.push(i === 0 ? `${number}... ${move}` : move);
    if (!whiteToMove) number++;
    whiteToMove = !whiteToMove;
  });

  return parts.join(" ");
}

/** Like numberedLine, but each move carries its own number: ["3... Nf6", "4. Qxf7#"]. */
export function numberedMoves(fen: string, san: string[]): string[] {
  const [, side, , , , fullmove] = fen.split(" ");
  const start = Number(fullmove) || 1;
  const blackFirst = side === "b";
  return san.map((move, i) => {
    const ply = i + (blackFirst ? 1 : 0);
    const number = start + Math.floor(ply / 2);
    return ply % 2 === 0 ? `${number}. ${move}` : `${number}... ${move}`;
  });
}
