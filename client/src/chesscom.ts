// Chess.com's public API (Published-Data API): read-only, no sign-in, and it allows requests
// from any page (Access-Control-Allow-Origin: *), so the browser calls it directly and the
// ChessBuddy server never does. Chess.com only asks that requests are made one at a time.
import { isStartPosition, readPgn } from "../../shared/pgn";
import type { Color } from "../../shared/types";
import { toReviewGame, type ReviewGame } from "./review";

const API = "https://api.chess.com/pub/player/";
const ARCHIVE_URL = /^https:\/\/api\.chess\.com\/pub\/player\/[a-z0-9_-]+\/games\/\d{4}\/\d{2}$/i;
/** Chess.com usernames: 3 to 25 letters, digits, underscores or hyphens. */
const USERNAME = /^[A-Za-z0-9_-]{3,25}$/;
/** A game's page: /game/live/<id>, /game/daily/<id>, the older /live/game/<id>, or the analysis board. */
const GAME_LINK = /chess\.com\/(?:analysis\/)?(?:game\/(live|daily)|(live|daily)\/game)\/(\d+)/i;
/** Most games one listing reads: a month at a time until it has this many more. */
const PAGE_GAMES = 20;
/** Most archives one listing reads, so a player with few games doesn't load years of them. */
const PAGE_MONTHS = 3;
/** How far back a pasted link is looked for. */
const LINK_MONTHS = 12;

const VARIANT_NAMES: Record<string, string> = {
  chess960: "Chess960",
  bughouse: "Bughouse",
  crazyhouse: "Crazyhouse",
  kingofthehill: "King of the Hill",
  threecheck: "3-Check",
  oddschess: "Odds chess",
};

interface ApiPlayer {
  username: string;
  rating?: number;
  /** "win", or how the game ended for this player: "resigned", "timeout", "agreed", ... */
  result?: string;
}

/** A game in a Chess.com monthly archive: the fields ChessBuddy uses. */
export interface ApiGame {
  url: string;
  pgn?: string;
  time_control?: string;
  time_class?: string;
  /** Unix time in seconds. */
  end_time?: number;
  /** "chess" for standard chess, otherwise the variant, such as "chess960". */
  rules?: string;
  initial_setup?: string;
  /** Chess.com's accuracy figures, present when the game was reviewed on Chess.com. */
  accuracies?: { white: number; black: number };
  white: ApiPlayer;
  black: ApiPlayer;
}

/** A player's games, newest first, and the monthly archives not read yet. */
export interface GamePage {
  username: string;
  games: ApiGame[];
  /** Archive URLs, newest first. */
  older: string[];
}

/** A Chess.com request that failed, with a message for the player. */
export class ChessComError extends Error {}

/** The username in the form the API's URLs use; throws when it can't be a Chess.com username. */
export function checkUsername(input: string): string {
  const name = input.trim();
  if (!name) throw new ChessComError("Type your Chess.com username.");
  if (!USERNAME.test(name)) {
    throw new ChessComError("A Chess.com username has 3 to 25 letters, digits, underscores or hyphens.");
  }
  return name.toLowerCase();
}

/** "live/123" or "daily/123" for a Chess.com game link (or the game's own url), otherwise null. */
export function gameLinkId(text: string): string | null {
  const match = GAME_LINK.exec(text);
  return match ? `${(match[1] ?? match[2]).toLowerCase()}/${match[3]}` : null;
}

/** Why a game can't be reviewed, or null when it can. */
export function unsupportedReason(game: ApiGame): string | null {
  if (game.rules && game.rules !== "chess") {
    return `${VARIANT_NAMES[game.rules] ?? game.rules} games can't be reviewed, only standard chess.`;
  }
  if (game.initial_setup && !isStartPosition(game.initial_setup)) {
    return "This game starts from a set-up position, so it can't be reviewed.";
  }
  if (!game.pgn) return "Chess.com has no moves for this game.";
  return null;
}

/** The player's color in a game, or null if they didn't play in it. */
export function playerColor(game: ApiGame, username: string): Color | null {
  const name = username.toLowerCase();
  if (game.white.username.toLowerCase() === name) return "w";
  if (game.black.username.toLowerCase() === name) return "b";
  return null;
}

/** How the game went for the player of `color`. */
export function outcome(game: ApiGame, color: Color): "won" | "lost" | "drawn" {
  const [mine, theirs] = color === "w" ? [game.white, game.black] : [game.black, game.white];
  return mine.result === "win" ? "won" : theirs.result === "win" ? "lost" : "drawn";
}

/** A Chess.com game, ready to review. Throws a ChessComError or PgnError when it can't be. */
export function reviewGameOf(game: ApiGame): ReviewGame {
  const reason = unsupportedReason(game);
  if (reason) throw new ChessComError(reason);
  const fromPgn = toReviewGame(readPgn(game.pgn!));
  return {
    ...fromPgn,
    white: { name: game.white.username, rating: game.white.rating },
    black: { name: game.black.username, rating: game.black.rating },
    url: game.url,
    timeClass: game.time_class ?? fromPgn.timeClass,
    accuracies: game.accuracies,
  };
}

/** Reads Chess.com's public API, one request at a time. */
export class ChessCom {
  constructor(private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init)) {}

  /** The player's monthly archives, newest first. */
  async archives(username: string): Promise<string[]> {
    const name = checkUsername(username);
    const data = await this.get<{ archives?: unknown }>(`${API}${name}/games/archives`, `No Chess.com player is called "${username.trim()}".`);
    const archives = Array.isArray(data.archives)
      ? data.archives.filter((url): url is string => typeof url === "string" && ARCHIVE_URL.test(url))
      : [];
    return archives.sort().reverse();
  }

  /** One monthly archive's games, newest first. */
  async month(url: string): Promise<ApiGame[]> {
    if (!ARCHIVE_URL.test(url)) throw new ChessComError("That isn't a Chess.com game archive.");
    const data = await this.get<{ games?: unknown }>(url, "Chess.com has no games for that month.");
    const games = Array.isArray(data.games) ? (data.games as ApiGame[]).filter(isGame) : [];
    return games.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0));
  }

  /** The player's most recent games: the latest months, until about a page of games. */
  async recent(username: string): Promise<GamePage> {
    return this.more({ username: username.trim(), games: [], older: await this.archives(username) });
  }

  /** The page with older games added: the next months, until about a page more. */
  async more(page: GamePage): Promise<GamePage> {
    let { games, older } = page;
    const wanted = games.length + PAGE_GAMES;
    for (let read = 0; older.length > 0 && games.length < wanted && read < PAGE_MONTHS; read++) {
      games = [...games, ...(await this.month(older[0]))];
      older = older.slice(1);
    }
    return { ...page, games, older };
  }

  /** The player's game a link points to, looked for in their archives from the newest month back. */
  async findGame(username: string, link: string): Promise<ApiGame> {
    const id = gameLinkId(link);
    if (!id) throw new ChessComError("That isn't a Chess.com game link.");
    for (const url of (await this.archives(username)).slice(0, LINK_MONTHS)) {
      const found = (await this.month(url)).find((game) => gameLinkId(game.url) === id);
      if (found) return found;
    }
    throw new ChessComError(
      `That game isn't among ${username.trim()}'s games of the last ${LINK_MONTHS} months. Check the username, or paste the game's PGN (Share → PGN on Chess.com).`,
    );
  }

  private async get<T>(url: string, notFound: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(url);
    } catch {
      throw new ChessComError("Couldn't reach Chess.com. Check your connection and try again.");
    }
    if (response.status === 404) throw new ChessComError(notFound);
    if (response.status === 429) throw new ChessComError("Chess.com is limiting requests. Wait a minute and try again.");
    if (!response.ok) throw new ChessComError(`Chess.com didn't answer the request (error ${response.status}). Try again later.`);
    try {
      return (await response.json()) as T;
    } catch {
      throw new ChessComError("Chess.com sent an answer ChessBuddy can't read. Try again later.");
    }
  }
}

function isGame(game: ApiGame): boolean {
  return (
    typeof game === "object" &&
    game !== null &&
    typeof game.url === "string" &&
    typeof game.white?.username === "string" &&
    typeof game.black?.username === "string"
  );
}
