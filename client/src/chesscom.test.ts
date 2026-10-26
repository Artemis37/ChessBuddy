import { describe, expect, it } from "vitest";
import {
  ChessCom,
  ChessComError,
  checkUsername,
  gameLinkId,
  outcome,
  playerColor,
  reviewGameOf,
  unsupportedReason,
  type ApiGame,
} from "./chesscom";

const API = "https://api.chess.com/pub/player/kviiilyn37_/games";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PGN = `[Event "Live Chess"]
[White "kviiilyn37_"]
[Black "Opponent99"]
[Result "1-0"]
[Termination "kviiilyn37_ won by checkmate"]
[UTCDate "2026.10.25"]
[TimeControl "180"]
[Link "https://www.chess.com/game/live/2002"]

1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:03:00]} 2. Bc4 2... Nc6 3. Qh5 3... Nf6 4. Qxf7# 1-0`;

function game(id: number, endTime: number, extra: Partial<ApiGame> = {}): ApiGame {
  return {
    url: `https://www.chess.com/game/live/${id}`,
    pgn: PGN,
    time_control: "180",
    time_class: "blitz",
    end_time: endTime,
    rules: "chess",
    initial_setup: START,
    white: { username: "kviiilyn37_", rating: 1012, result: "win" },
    black: { username: "Opponent99", rating: 987, result: "checkmated" },
    ...extra,
  };
}

/** A fake fetch answering from a URL -> body table (a number is a status), recording every request. */
function fakeFetch(table: Record<string, unknown>) {
  const requested: string[] = [];
  let inFlight = 0;
  let mostInFlight = 0;
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    inFlight++;
    mostInFlight = Math.max(mostInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    const body = table[url];
    if (body === undefined || typeof body === "number") {
      return new Response("{}", { status: typeof body === "number" ? body : 404 });
    }
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { fetchFn, requested, mostInFlight: () => mostInFlight };
}

function months(count: number, gamesPerMonth: number) {
  const archives = Array.from({ length: count }, (_, i) => `${API}/2026/${String(i + 1).padStart(2, "0")}`);
  const table: Record<string, unknown> = { [`${API}/archives`]: { archives } };
  archives.forEach((url, m) => {
    table[url] = { games: Array.from({ length: gamesPerMonth }, (_, g) => game(m * 100 + g, m * 100 + g)) };
  });
  return { archives, table };
}

describe("checkUsername", () => {
  it("lowercases and trims a username", () => {
    expect(checkUsername("  Kviiilyn37_ ")).toBe("kviiilyn37_");
    expect(checkUsername("some-player")).toBe("some-player");
  });

  it("rejects anything that can't be a Chess.com username", () => {
    expect(() => checkUsername("")).toThrow(new ChessComError("Type your Chess.com username."));
    expect(() => checkUsername("ab")).toThrow(/3 to 25 letters/);
    expect(() => checkUsername("../../other")).toThrow(ChessComError);
    expect(() => checkUsername("name?x=1")).toThrow(ChessComError);
    expect(() => checkUsername("a".repeat(26))).toThrow(ChessComError);
  });
});

describe("gameLinkId", () => {
  it("reads the game links Chess.com uses", () => {
    expect(gameLinkId("https://www.chess.com/game/live/184627853334")).toBe("live/184627853334");
    expect(gameLinkId("chess.com/game/daily/123?move=4")).toBe("daily/123");
    expect(gameLinkId("https://www.chess.com/live/game/987")).toBe("live/987");
    expect(gameLinkId("https://www.chess.com/analysis/game/live/55?tab=review")).toBe("live/55");
  });

  it("is null for anything else", () => {
    expect(gameLinkId("1. e4 e5")).toBeNull();
    expect(gameLinkId("https://lichess.org/abcdefgh")).toBeNull();
    expect(gameLinkId("https://www.chess.com/member/hikaru")).toBeNull();
  });
});

describe("unsupportedReason", () => {
  it("accepts standard chess from the starting position", () => {
    expect(unsupportedReason(game(1, 1))).toBeNull();
  });

  it("rejects variants and set-up positions", () => {
    expect(unsupportedReason(game(1, 1, { rules: "chess960" }))).toBe("Chess960 games can't be reviewed, only standard chess.");
    expect(unsupportedReason(game(1, 1, { rules: "threecheck" }))).toMatch(/^3-Check/);
    expect(unsupportedReason(game(1, 1, { initial_setup: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1" }))).toMatch(/set-up position/);
    expect(unsupportedReason(game(1, 1, { pgn: undefined }))).toMatch(/no moves/);
  });
});

describe("reviewGameOf", () => {
  it("takes the players from the API and the moves from the PGN", () => {
    const review = reviewGameOf(game(2002, 1, { accuracies: { white: 91.2, black: 40.5 } }));
    expect(review.white).toEqual({ name: "kviiilyn37_", rating: 1012 });
    expect(review.black).toEqual({ name: "Opponent99", rating: 987 });
    expect(review.result).toBe("1-0");
    expect(review.termination).toBe("kviiilyn37_ won by checkmate");
    expect(review.url).toBe("https://www.chess.com/game/live/2002");
    expect(review.timeClass).toBe("blitz");
    expect(review.accuracies).toEqual({ white: 91.2, black: 40.5 });
    expect(review.moves.map((m) => m.san).join(" ")).toBe("e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#");
  });

  it("refuses a variant", () => {
    expect(() => reviewGameOf(game(1, 1, { rules: "chess960" }))).toThrow(ChessComError);
  });
});

describe("playerColor and outcome", () => {
  it("finds the player's side, whatever the case of the name", () => {
    expect(playerColor(game(1, 1), "KVIIILYN37_")).toBe("w");
    expect(playerColor(game(1, 1), "opponent99")).toBe("b");
    expect(playerColor(game(1, 1), "someone")).toBeNull();
  });

  it("says how the game went for a side", () => {
    expect(outcome(game(1, 1), "w")).toBe("won");
    expect(outcome(game(1, 1), "b")).toBe("lost");
    const drawn = game(1, 1, {
      white: { username: "a", result: "agreed" },
      black: { username: "b", result: "agreed" },
    });
    expect(outcome(drawn, "w")).toBe("drawn");
  });
});

describe("ChessCom", () => {
  it("lists the archives newest first and ignores anything that isn't one", async () => {
    const { fetchFn, requested } = fakeFetch({
      [`${API}/archives`]: { archives: [`${API}/2026/09`, `${API}/2026/10`, "https://evil.example/x", 42] },
    });
    expect(await new ChessCom(fetchFn).archives("Kviiilyn37_")).toEqual([`${API}/2026/10`, `${API}/2026/09`]);
    expect(requested).toEqual([`${API}/archives`]);
  });

  it("checks the username before making a request", async () => {
    const { fetchFn, requested } = fakeFetch({});
    await expect(new ChessCom(fetchFn).archives("bad/name")).rejects.toThrow(ChessComError);
    expect(requested).toEqual([]);
  });

  it("explains failed requests", async () => {
    const { fetchFn } = fakeFetch({ [`${API}/archives`]: 429 });
    await expect(new ChessCom(fetchFn).archives("kviiilyn37_")).rejects.toThrow(/limiting requests/);
    await expect(new ChessCom(fakeFetch({}).fetchFn).archives("nobody_here")).rejects.toThrow(
      'No Chess.com player is called "nobody_here".',
    );
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    await expect(new ChessCom(offline).archives("kviiilyn37_")).rejects.toThrow(/Couldn't reach Chess.com/);
    await expect(new ChessCom(fakeFetch({ [`${API}/archives`]: 403 }).fetchFn).archives("kviiilyn37_")).rejects.toThrow(
      /error 403/,
    );
  });

  it("only reads archive URLs from api.chess.com", async () => {
    const { fetchFn, requested } = fakeFetch({});
    await expect(new ChessCom(fetchFn).month("https://evil.example/pub/player/x/games/2026/10")).rejects.toThrow(
      ChessComError,
    );
    expect(requested).toEqual([]);
  });

  it("lists recent games newest first, a month at a time, one request at a time", async () => {
    const { table, archives } = months(3, 15);
    const fake = fakeFetch(table);
    const chesscom = new ChessCom(fake.fetchFn);

    const page = await chesscom.recent("kviiilyn37_");
    // The newest month has 15 games, fewer than a page, so the one before is read too.
    expect(fake.requested).toEqual([`${API}/archives`, archives[2], archives[1]]);
    expect(page.games).toHaveLength(30);
    expect(page.games[0].end_time).toBe(214);
    expect(page.games[14].end_time).toBe(200);
    expect(page.games[15].end_time).toBe(114);
    expect(page.older).toEqual([archives[0]]);

    const more = await chesscom.more(page);
    expect(more.games).toHaveLength(45);
    expect(more.older).toEqual([]);
    expect(fake.mostInFlight()).toBe(1);
  });

  it("reads at most three months for one page", async () => {
    const { table, archives } = months(6, 1);
    const fake = fakeFetch(table);
    const page = await new ChessCom(fake.fetchFn).recent("kviiilyn37_");
    expect(page.games).toHaveLength(3);
    expect(page.older).toEqual([archives[2], archives[1], archives[0]]);
  });

  it("finds a linked game in an older month and stops there", async () => {
    const { table, archives } = months(4, 5);
    const fake = fakeFetch(table);
    const found = await new ChessCom(fake.fetchFn).findGame("kviiilyn37_", "https://www.chess.com/game/live/102");
    expect(found.url).toBe("https://www.chess.com/game/live/102");
    expect(fake.requested).toEqual([`${API}/archives`, archives[3], archives[2], archives[1]]);
  });

  it("explains when a linked game isn't among the player's games", async () => {
    const { table } = months(2, 5);
    const chesscom = new ChessCom(fakeFetch(table).fetchFn);
    await expect(chesscom.findGame("kviiilyn37_", "https://www.chess.com/game/daily/102")).rejects.toThrow(
      /isn't among kviiilyn37_'s games of the last 12 months.*paste the game's PGN/,
    );
    await expect(chesscom.findGame("kviiilyn37_", "not a link")).rejects.toThrow("That isn't a Chess.com game link.");
  });
});
