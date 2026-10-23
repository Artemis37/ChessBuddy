/** Opening book keyed by position: piece placement, side to move, castling rights and en passant square. */
export type OpeningBook = Record<string, [eco: string, name: string]>;

export interface Opening {
  eco: string;
  name: string;
}

/** The part of a FEN that identifies the position, without the move counters. */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

/**
 * Name of the opening reached by a game, given the positions after each move in order.
 * Matches by position, so transpositions are named correctly; once the game leaves the book,
 * the last named position keeps its name, as on chess.com.
 */
export function openingFor(positions: string[], book: OpeningBook): Opening | null {
  for (let i = positions.length - 1; i >= 0; i--) {
    const entry = book[positionKey(positions[i])];
    if (entry) return { eco: entry[0], name: entry[1] };
  }
  return null;
}

/** One named line as client/public/opening-lines.json stores it: ECO code, name, SAN moves separated by spaces. */
export type OpeningLineRow = [eco: string, name: string, moves: string];

/** What learning openings needs: every named line, and the book moves from every position on them. */
export interface OpeningLibrary {
  lines: OpeningLineRow[];
  /** Book moves in SAN from each position, keyed like OpeningBook; the moves most lines go through first. */
  next: Record<string, string[]>;
}

export interface OpeningLine {
  eco: string;
  name: string;
  /** Moves from the starting position, in SAN. */
  moves: string[];
}

/** An opening and every named line in it: "Sicilian Defense" and its variations. */
export interface OpeningFamily {
  name: string;
  lines: OpeningLine[];
}

export function readLines(rows: OpeningLineRow[]): OpeningLine[] {
  return rows.map(([eco, name, moves]) => ({ eco, name, moves: moves.split(" ") }));
}

/** "Sicilian Defense: Najdorf Variation, English Attack" belongs to "Sicilian Defense". */
export function familyName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(0, colon).trim();
}

/** The part after the opening's name ("Najdorf Variation, English Attack"), or "" for the opening itself. */
export function variationName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? "" : name.slice(colon + 1).trim();
}

/**
 * Groups lines by opening, the openings with the most lines first. Within an opening, its own
 * lines come first (shortest first), then its variations in alphabetical order.
 */
export function openingFamilies(lines: OpeningLine[]): OpeningFamily[] {
  const byName = new Map<string, OpeningLine[]>();
  for (const line of lines) {
    const name = familyName(line.name);
    byName.set(name, [...(byName.get(name) ?? []), line]);
  }
  return [...byName.entries()]
    .map(([name, list]) => ({ name, lines: list.sort(byVariation) }))
    .sort((a, b) => b.lines.length - a.lines.length || a.name.localeCompare(b.name));
}

function byVariation(a: OpeningLine, b: OpeningLine): number {
  return variationName(a.name).localeCompare(variationName(b.name)) || a.moves.length - b.moves.length;
}

/** True when every word of the query is in the name, ignoring case and accents ("grunfeld" finds "Grünfeld"). */
export function nameMatches(name: string, query: string): boolean {
  const key = searchKey(name);
  return searchKey(query)
    .split(/\s+/)
    .every((word) => key.includes(word));
}

function searchKey(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Index of the first move where the moves played leave the line, or null while they follow it. */
export function divergence(line: string[], played: string[]): number | null {
  const shared = Math.min(line.length, played.length);
  for (let i = 0; i < shared; i++) if (line[i] !== played[i]) return i;
  return null;
}
