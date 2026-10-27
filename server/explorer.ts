import { z } from "zod";
import { EXPLORER_SPEEDS, type ExplorerStats } from "../shared/explorer";
import { positionKey } from "../shared/openings";

export const LICHESS_EXPLORER = "https://explorer.lichess.org";
/** Lichess allows each account 20 explorer requests a minute, one at a time. */
const REQUESTS_PER_MINUTE = 20;
/**
 * Background requests (the chart's other rating bands) may use this many of them, so stepping
 * through a line always leaves room for the band on screen.
 */
const BACKGROUND_PER_MINUTE = 12;
const MINUTE = 60_000;
/** After a 429, Lichess asks for a minute's pause. */
const PAUSE_AFTER_429 = MINUTE;
const MAX_TRIES = 3;
/** Every legal move is listed in practice, so the book's rarest moves get their share too. */
const MOVES_LISTED = 40;

export class ExplorerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const NO_TOKEN = "Add LICHESS_TOKEN to .env and restart the server to see how often each move is played.";

const results = { white: z.number(), draws: z.number(), black: z.number() };
const response = z.object({ ...results, moves: z.array(z.object({ san: z.string(), ...results })) });

interface Job {
  key: string;
  fen: string;
  rating: number;
  background: boolean;
  tries: number;
  resolve: (stats: ExplorerStats) => void;
  reject: (err: unknown) => void;
}

export interface ExplorerOptions {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Positions remembered, each in one rating band. */
  cacheSize?: number;
  baseUrl?: string;
}

/**
 * The Lichess opening explorer's rated blitz and rapid games, asked with the account's token
 * (LICHESS_TOKEN). Requests go one at a time, at most 20 a minute; the ones the board is waiting
 * for go before the background ones that fill in the other rating bands, which may use 12 of the
 * 20. Answers are remembered: the numbers barely change from one month to the next.
 */
export class LichessExplorer {
  private readonly cache = new Map<string, ExplorerStats>();
  private readonly queue: Job[] = [];
  /** When each of the last minute's requests was sent. */
  private readonly sent: number[] = [];
  private pausedUntil = 0;
  private draining = false;
  /** Ends the queue's wait early, when a request for the band on screen arrives. */
  private wake: (() => void) | null = null;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cacheSize: number;
  private readonly baseUrl: string;

  constructor(
    private readonly token: string | undefined,
    options: ExplorerOptions = {},
  ) {
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.cacheSize = options.cacheSize ?? 5000;
    this.baseUrl = options.baseUrl ?? LICHESS_EXPLORER;
  }

  get configured(): boolean {
    return Boolean(this.token);
  }

  /**
   * The games in the rating band that reached the position. A background request waits behind
   * the others; one whose signal aborts before its turn is dropped.
   */
  stats(fen: string, rating: number, { background = false, signal }: { background?: boolean; signal?: AbortSignal } = {}) {
    const key = `${rating}|${positionKey(fen)}`;
    const hit = this.remembered(key);
    if (hit) return Promise.resolve(hit);
    if (!this.token) return Promise.reject(new ExplorerError(503, NO_TOKEN));
    if (signal?.aborted) return Promise.reject(new ExplorerError(499, "Request cancelled"));
    return new Promise<ExplorerStats>((resolve, reject) => {
      const job: Job = { key, fen, rating, background, tries: 0, resolve, reject };
      const firstBackground = this.queue.findIndex((j) => j.background);
      if (background || firstBackground < 0) this.queue.push(job);
      else this.queue.splice(firstBackground, 0, job);
      signal?.addEventListener(
        "abort",
        () => {
          const waiting = this.queue.indexOf(job);
          if (waiting < 0) return;
          this.queue.splice(waiting, 1);
          reject(new ExplorerError(499, "Request cancelled"));
        },
        { once: true },
      );
      // The queue may be waiting for the background requests' share of the minute to free up.
      if (!background) this.wake?.();
      void this.drain();
    });
  }

  private remembered(key: string): ExplorerStats | undefined {
    const hit = this.cache.get(key);
    if (hit) {
      // Most recently used last, so the oldest go first when the cache is full.
      this.cache.delete(key);
      this.cache.set(key, hit);
    }
    return hit;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        await this.waitForTurn();
        // Requests cancelled while waiting have left the queue.
        const job = this.queue.shift();
        if (!job) break;
        // An earlier job may have asked for the same position.
        const hit = this.remembered(job.key);
        if (hit) {
          job.resolve(hit);
          continue;
        }
        await this.run(job);
      }
    } finally {
      this.draining = false;
    }
  }

  /**
   * Waits until the next request may go: after a pause Lichess asked for, and within the limit
   * for its kind, 20 a minute or 12 for a background request.
   */
  private async waitForTurn(): Promise<void> {
    for (;;) {
      const next = this.queue[0];
      if (!next) return;
      const now = this.now();
      while (this.sent.length > 0 && this.sent[0] <= now - MINUTE) this.sent.shift();
      const limit = next.background ? BACKGROUND_PER_MINUTE : REQUESTS_PER_MINUTE;
      // Once `limit` requests went out in the last minute, the next waits for the oldest that counts to expire.
      const free = this.sent.length >= limit ? this.sent[this.sent.length - limit] + MINUTE : 0;
      const ready = Math.max(this.pausedUntil, free);
      if (ready <= now) return;
      await Promise.race([this.sleep(ready - now), new Promise<void>((resolve) => (this.wake = resolve))]);
      this.wake = null;
    }
  }

  private async run(job: Job): Promise<void> {
    this.sent.push(this.now());
    job.tries++;
    const url = new URL("/lichess", this.baseUrl);
    url.search = new URLSearchParams({
      variant: "standard",
      fen: job.fen,
      speeds: EXPLORER_SPEEDS.join(","),
      ratings: String(job.rating),
      moves: String(MOVES_LISTED),
      topGames: "0",
      recentGames: "0",
    }).toString();
    let res: Response;
    try {
      res = await this.fetch(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      job.reject(new ExplorerError(503, `Can't reach the Lichess opening explorer (${reason}).`));
      return;
    }
    if (res.status === 429) {
      console.warn("Opening explorer: Lichess answered 429 (too many requests); pausing a minute.");
      this.pausedUntil = this.now() + PAUSE_AFTER_429;
      if (job.tries < MAX_TRIES) this.queue.unshift(job);
      else job.reject(new ExplorerError(503, "Lichess is limiting requests. Try again in a minute."));
      return;
    }
    if (res.status === 401 || res.status === 403) {
      job.reject(
        new ExplorerError(
          503,
          "Lichess turned down LICHESS_TOKEN. Make a new token at lichess.org/account/oauth/token and put it in .env.",
        ),
      );
      return;
    }
    if (!res.ok) {
      job.reject(new ExplorerError(503, `The Lichess opening explorer answered ${res.status}. Try again later.`));
      return;
    }
    const parsed = response.safeParse(await res.json().catch(() => null));
    if (!parsed.success) {
      job.reject(new ExplorerError(503, "The Lichess opening explorer sent an answer this app doesn't understand."));
      return;
    }
    const { white, draws, black, moves } = parsed.data;
    const stats: ExplorerStats = {
      white,
      draws,
      black,
      moves: moves.map((m) => ({ san: m.san, white: m.white, draws: m.draws, black: m.black })),
    };
    this.cache.set(job.key, stats);
    if (this.cache.size > this.cacheSize) this.cache.delete(this.cache.keys().next().value!);
    job.resolve(stats);
  }
}
