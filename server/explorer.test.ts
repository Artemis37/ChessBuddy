import { describe, expect, it, vi } from "vitest";
import { RATING_BANDS } from "../shared/explorer";
import { ExplorerError, LichessExplorer, NO_TOKEN } from "./explorer";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const AFTER_E4_C5 = "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

/** What the explorer sends, trimmed: the app keeps the results and each move's SAN and results. */
const ANSWER = {
  white: 60,
  draws: 10,
  black: 30,
  moves: [
    { uci: "e2e4", san: "e4", averageRating: 1500, white: 40, draws: 5, black: 15, game: null, opening: null },
    { uci: "d2d4", san: "d4", averageRating: 1510, white: 20, draws: 5, black: 15, game: null, opening: null },
  ],
  topGames: [],
  opening: null,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/**
 * An explorer whose fetches, clock and sleeps are recorded; `answer` can hold a fetch back or fail
 * it. Sleeping moves the clock on at once, unless `sleepForever` keeps every wait waiting.
 */
function setup(
  answer: (url: URL, call: number) => Promise<Response> | Response = () => Response.json(ANSWER),
  { sleepForever = false } = {},
) {
  const calls: { url: URL; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  let now = 0;
  const explorer = new LichessExplorer("lip_test", {
    fetch: (async (input: URL, init?: RequestInit) => {
      calls.push({ url: input, headers: init?.headers as Record<string, string> });
      return answer(input, calls.length);
    }) as typeof fetch,
    now: () => now,
    sleep: (ms) => {
      sleeps.push(ms);
      if (sleepForever) return new Promise(() => {});
      now += ms;
      return Promise.resolve();
    },
  });
  return { explorer, calls, sleeps };
}

const POSITIONS = [START, AFTER_E4, AFTER_E4_C5].flatMap((fen) => RATING_BANDS.map((b) => [fen, b.rating] as const));

describe("LichessExplorer", () => {
  it("asks for the position's rated blitz and rapid games in one rating band, with the token", async () => {
    const { explorer, calls } = setup();
    const stats = await explorer.stats(AFTER_E4_C5, 1400);
    expect(stats).toEqual({
      white: 60,
      draws: 10,
      black: 30,
      moves: [
        { san: "e4", white: 40, draws: 5, black: 15 },
        { san: "d4", white: 20, draws: 5, black: 15 },
      ],
    });
    const { url, headers } = calls[0];
    expect(url.origin + url.pathname).toBe("https://explorer.lichess.org/lichess");
    expect(url.searchParams.get("fen")).toBe(AFTER_E4_C5);
    expect(url.searchParams.get("ratings")).toBe("1400");
    expect(url.searchParams.get("speeds")).toBe("blitz,rapid");
    expect(url.searchParams.get("topGames")).toBe("0");
    expect(url.searchParams.get("recentGames")).toBe("0");
    expect(headers.Authorization).toBe("Bearer lip_test");
  });

  it("remembers answers by position and band, whatever the move counters", async () => {
    const { explorer, calls } = setup();
    await explorer.stats(AFTER_E4_C5, 1400);
    await explorer.stats(AFTER_E4_C5.replace(/ 0 2$/, " 4 9"), 1400);
    expect(calls).toHaveLength(1);
    await explorer.stats(AFTER_E4_C5, 1600);
    expect(calls).toHaveLength(2);
  });

  it("refuses without a token, saying how to add one", async () => {
    const explorer = new LichessExplorer(undefined);
    expect(explorer.configured).toBe(false);
    await expect(explorer.stats(START, 1400)).rejects.toMatchObject({ status: 503, message: NO_TOKEN });
  });

  it("sends at most 20 requests a minute", async () => {
    const { explorer, calls, sleeps } = setup();
    await Promise.all(POSITIONS.slice(0, 21).map(([fen, rating]) => explorer.stats(fen, rating)));
    expect(calls).toHaveLength(21);
    // The first 20 go at once; the 21st waits until a minute after the first.
    expect(sleeps).toEqual([60_000]);
  });

  it("keeps 8 of the minute's requests for the band on screen", async () => {
    const { explorer, calls, sleeps } = setup(undefined, { sleepForever: true });
    for (const [fen, rating] of POSITIONS.slice(0, 13)) void explorer.stats(fen, rating, { background: true });
    // 12 background requests go; the 13th waits for the first to be a minute old.
    await vi.waitFor(() => expect(sleeps).toEqual([60_000]));
    expect(calls).toHaveLength(12);
    // The band on screen doesn't wait for that.
    const [fen, rating] = POSITIONS[13];
    await explorer.stats(fen, rating);
    expect(calls).toHaveLength(13);
    expect(calls[12].url.searchParams.get("ratings")).toBe(String(rating));
  });

  it("answers the band on screen before the background ones", async () => {
    const held = deferred();
    const { explorer, calls } = setup(async (_url, call) => {
      if (call === 1) await held.promise;
      return Response.json(ANSWER);
    });
    const first = explorer.stats(START, 1400);
    const background = explorer.stats(START, 1600, { background: true });
    const onScreen = explorer.stats(AFTER_E4, 1400);
    held.resolve();
    await Promise.all([first, background, onScreen]);
    expect(calls.map((c) => [c.url.searchParams.get("fen"), c.url.searchParams.get("ratings")])).toEqual([
      [START, "1400"],
      [AFTER_E4, "1400"],
      [START, "1600"],
    ]);
  });

  it("drops a request cancelled while it waits", async () => {
    const held = deferred();
    const { explorer, calls } = setup(async (_url, call) => {
      if (call === 1) await held.promise;
      return Response.json(ANSWER);
    });
    const first = explorer.stats(START, 1400);
    const cancel = new AbortController();
    const left = explorer.stats(AFTER_E4, 1400, { signal: cancel.signal });
    cancel.abort();
    await expect(left).rejects.toMatchObject({ status: 499 });
    held.resolve();
    await first;
    expect(calls).toHaveLength(1);
  });

  it("pauses a minute when Lichess says to slow down, then asks again", async () => {
    const { explorer, calls, sleeps } = setup((_url, call) =>
      call === 1 ? new Response("Too many requests", { status: 429 }) : Response.json(ANSWER),
    );
    expect((await explorer.stats(START, 1400)).white).toBe(60);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([60_000]);
  });

  it("says when Lichess turns the token down", async () => {
    const { explorer } = setup(() => new Response("Unauthorized", { status: 401 }));
    const err = await explorer.stats(START, 1400).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExplorerError);
    expect((err as ExplorerError).message).toMatch(/turned down LICHESS_TOKEN/);
  });

  it("reports an answer it can't read instead of passing it on", async () => {
    const { explorer } = setup(() => Response.json({ moves: "nothing" }));
    await expect(explorer.stats(START, 1400)).rejects.toMatchObject({ status: 503 });
  });
});
