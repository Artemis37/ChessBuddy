/**
 * Turns the Lichess opening list (data/openings/*.tsv, CC0) into the client's opening files.
 * Run with `npm run openings:build`.
 * - client/public/openings.json: a lookup from position to opening name, loaded with the app.
 * - client/public/opening-lines.json: every named line and the book moves from each position
 *   on them, loaded when you learn openings.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import { positionKey, type OpeningBook, type OpeningLibrary, type OpeningLineRow } from "../shared/openings";

const SOURCE = path.resolve("data/openings");
const BOOK_TARGET = path.resolve("client/public/openings.json");
const LINES_TARGET = path.resolve("client/public/opening-lines.json");

const book: OpeningBook = {};
const lines: OpeningLineRow[] = [];
/** Position -> book move -> how many lines play it there. */
const next: Record<string, Map<string, number>> = {};

for (const file of readdirSync(SOURCE).filter((f) => f.endsWith(".tsv")).sort()) {
  const rows = readFileSync(path.join(SOURCE, file), "utf8").trim().split(/\r?\n/).slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    const game = new Chess();
    const moves: string[] = [];
    for (const san of pgn.split(/\s+/).filter((token) => !/^\d+\.$/.test(token))) {
      const counts = (next[positionKey(game.fen())] ??= new Map());
      // chess.js's SAN, so the moves compare equal to the moves played in the app.
      const move = game.move(san).san;
      counts.set(move, (counts.get(move) ?? 0) + 1);
      moves.push(move);
    }
    // The first, shortest line to reach a position names it.
    book[positionKey(game.fen())] ??= [eco, name];
    lines.push([eco, name, moves.join(" ")]);
  }
}

const library: OpeningLibrary = {
  lines,
  next: Object.fromEntries(
    Object.entries(next).map(([key, counts]) => [key, [...counts].sort((a, b) => b[1] - a[1]).map(([move]) => move)]),
  ),
};

writeFileSync(BOOK_TARGET, JSON.stringify(book));
writeFileSync(LINES_TARGET, JSON.stringify(library));
console.log(`${lines.length} lines, ${Object.keys(book).length} named positions -> ${path.relative(process.cwd(), BOOK_TARGET)}`);
console.log(`${Object.keys(library.next).length} positions with book moves -> ${path.relative(process.cwd(), LINES_TARGET)}`);
