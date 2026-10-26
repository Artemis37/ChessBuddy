import { Chess } from "chess.js";

const START_FEN = new Chess().fen();
/** Variant tags that still mean standard chess. */
const STANDARD_VARIANTS = ["standard", "chess", "normal"];
/** A tag pair line, such as [White "Hikaru"]; a clock comment like [%clk 0:03:00] isn't one. */
const TAG_LINE = /^\s*\[[A-Za-z0-9_]+\s+"/;

/** A game read from PGN: its tag pairs and its moves from the standard starting position. */
export interface PgnGame {
  /** Tag pairs that have a value; chess.js's "?" placeholders are left out. */
  headers: Record<string, string>;
  moves: { san: string; uci: string }[];
}

/** A PGN that can't be reviewed, with a message for the player. */
export class PgnError extends Error {}

/**
 * Reads the first game of a PGN, such as Chess.com's Share → PGN. Variants such as Chess960 and
 * games from a set-up position are rejected: grading and the opening names assume standard chess.
 */
export function readPgn(text: string): PgnGame {
  const pgn = firstGame(text.replace(/\r\n?/g, "\n").replace(/^﻿/, "").trim());
  if (!pgn) throw new PgnError("Paste a game's PGN first.");

  const variant = tagValue(pgn, "Variant");
  if (variant && !STANDARD_VARIANTS.includes(variant.toLowerCase())) {
    throw new PgnError(`${variant} games can't be reviewed, only standard chess.`);
  }
  const fen = tagValue(pgn, "FEN");
  if (fen && !isStartPosition(fen)) {
    throw new PgnError("This game starts from a set-up position. Only games from the standard starting position can be reviewed.");
  }

  const board = new Chess();
  try {
    board.loadPgn(pgn);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new PgnError(`That isn't a PGN ChessBuddy can read (${reason}).`);
  }
  const moves = board.history({ verbose: true }).map((m) => ({ san: m.san, uci: m.lan }));
  if (moves.length === 0) throw new PgnError("This game has no moves to review.");

  const headers = Object.fromEntries(
    Object.entries(board.getHeaders()).filter(([, value]) => value && !/^[?.]+$/.test(value)),
  );
  return { headers, moves };
}

/** True when a FEN is the standard starting position, whatever its move counters say. */
export function isStartPosition(fen: string): boolean {
  return fen.trim().split(/\s+/).slice(0, 4).join(" ") === START_FEN.split(" ").slice(0, 4).join(" ");
}

/** The text of the first game: a tag line after the moves starts the next one. */
function firstGame(text: string): string {
  const lines = text.split("\n");
  let seenMoves = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TAG_LINE.test(line)) {
      if (seenMoves) return lines.slice(0, i).join("\n").trim();
    } else if (line.trim()) {
      seenMoves = true;
    }
  }
  return text;
}

function tagValue(pgn: string, name: string): string | undefined {
  return new RegExp(`^\\s*\\[${name}\\s+"([^"]*)"\\s*\\]`, "m").exec(pgn)?.[1]?.trim() || undefined;
}
