/**
 * Turns the Lichess opening list (data/openings/*.tsv, CC0) into client/public/openings.json,
 * a lookup from position to opening name. Run with `npm run openings:build`.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import { positionKey, type OpeningBook } from "../shared/openings";

const SOURCE = path.resolve("data/openings");
const TARGET = path.resolve("client/public/openings.json");

const book: OpeningBook = {};
let lines = 0;

for (const file of readdirSync(SOURCE).filter((f) => f.endsWith(".tsv")).sort()) {
  const rows = readFileSync(path.join(SOURCE, file), "utf8").trim().split(/\r?\n/).slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split("\t");
    const game = new Chess();
    for (const san of pgn.split(/\s+/).filter((token) => !/^\d+\.$/.test(token))) game.move(san);
    // The first, shortest line to reach a position names it.
    book[positionKey(game.fen())] ??= [eco, name];
    lines++;
  }
}

writeFileSync(TARGET, JSON.stringify(book));
console.log(`${lines} lines, ${Object.keys(book).length} positions -> ${path.relative(process.cwd(), TARGET)}`);
