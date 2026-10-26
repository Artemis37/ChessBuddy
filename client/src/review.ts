import type { PgnGame } from "../../shared/pgn";
import type { Color } from "../../shared/types";
import type { PlayedMove } from "./game";

/** A finished game to review: who played it, how it ended, and its moves. */
export interface ReviewGame {
  white: { name: string; rating?: number };
  black: { name: string; rating?: number };
  /** "1-0", "0-1", "1/2-1/2", or "*" when the PGN doesn't say. */
  result: string;
  /** How it ended, such as "Hikaru won by resignation". */
  termination?: string;
  /** The game's page, such as https://www.chess.com/game/live/123. */
  url?: string;
  /** The day it was played, as the PGN writes it: "2026.09.30". */
  date?: string;
  /** The PGN's TimeControl, such as "180+2" or "1/86400". */
  timeControl?: string;
  /** Chess.com's time class: "bullet", "blitz", "rapid" or "daily". */
  timeClass?: string;
  /** Chess.com's own accuracy figures, when the game was reviewed there. */
  accuracies?: { white: number; black: number };
  moves: { san: string; uci: string }[];
}

const RESULTS = ["1-0", "0-1", "1/2-1/2"];

/** A game read from PGN, ready to review. */
export function toReviewGame({ headers, moves }: PgnGame): ReviewGame {
  const rating = (tag?: string) => {
    const value = Number(tag);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  // Chess.com puts the game's page in Link; other sites use Site.
  const page = [headers.Link, headers.Site].find((url) => url?.startsWith("https://"));
  return {
    white: { name: headers.White ?? "White", rating: rating(headers.WhiteElo) },
    black: { name: headers.Black ?? "Black", rating: rating(headers.BlackElo) },
    result: RESULTS.includes(headers.Result) ? headers.Result : "*",
    termination: headers.Termination,
    url: page,
    date: headers.UTCDate ?? headers.Date,
    timeControl: headers.TimeControl,
    moves,
  };
}

/** The side a player had in the game, or null if neither name is theirs. */
export function sideOf(game: ReviewGame, username: string): Color | null {
  const name = username.trim().toLowerCase();
  if (!name) return null;
  if (game.white.name.toLowerCase() === name) return "w";
  if (game.black.name.toLowerCase() === name) return "b";
  return null;
}

/** The result as the move list shows it: "1-0", "0-1", "½-½" or "*". */
export function scoreOf(result: string): string {
  return result === "1/2-1/2" ? "½-½" : result;
}

/** A PGN TimeControl as Chess.com writes it: "3 min", "3 | 2", "30 sec", "1 day". */
export function timeControlLabel(control: string | undefined): string | null {
  const daily = /^1\/(\d+)$/.exec(control ?? "");
  if (daily) {
    const days = Math.round(Number(daily[1]) / 86400);
    return days === 1 ? "1 day" : `${days} days`;
  }
  const live = /^(\d+)(?:\+(\d+))?$/.exec(control ?? "");
  if (!live) return null;
  const base = Number(live[1]);
  const start = base < 60 ? `${base} sec` : `${Math.round((base / 60) * 10) / 10} min`;
  return live[2] && live[2] !== "0" ? `${start.replace(" min", "")} | ${live[2]}` : start;
}

/** A PGN date ("2026.09.30") for display, or null when it's unknown. */
export function dateLabel(date: string | undefined): string | null {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date ?? "");
  if (!match) return null;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return day.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * The moves to start grading while reviewing a game, `free` at most: the move on the board
 * first, so its evaluation shows soon, then the earliest moves still waiting.
 */
export function nextToGrade(moves: PlayedMove[], current: number, free: number): number[] {
  const waiting = (i: number) => {
    const m = moves[i];
    return Boolean(m?.graded && !m.grade && !m.grading && !m.gradeError);
  };
  const picked = waiting(current) ? [current] : [];
  for (let i = 0; i < moves.length && picked.length < free; i++) {
    if (i !== current && waiting(i)) picked.push(i);
  }
  return picked.slice(0, Math.max(0, free));
}
