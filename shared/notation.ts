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
