import { useEffect, useState } from "react";
import { DEFAULT_BAND, isBandRating, RATING_BANDS, type ExplorerStats } from "../../shared/explorer";
import { positionKey } from "../../shared/openings";
import { api } from "./api";

const STORE_PREFIX = "chessbuddy.explorer:";
const BAND_KEY = "chessbuddy.explorerBand";
/** How often moves are played changes slowly: a month-old answer is still good. */
const KEEP_FOR = 30 * 24 * 60 * 60 * 1000;
/** How long a position stays on screen before the chart's other rating bands are asked for. */
const CHART_DELAY = 1500;
/** An answer usually takes a fraction of a second; after this long, the caption says why it's waiting. */
const SLOW_AFTER = 3000;

/** Answers this page has seen; null when storage had nothing for the position either. */
const memory = new Map<string, ExplorerStats | null>();

const cacheKey = (fen: string, rating: number) => `${rating}|${positionKey(fen)}`;

/** The rating band's statistics for the position, if this browser has them. */
export function cachedStats(fen: string, rating: number): ExplorerStats | undefined {
  const key = cacheKey(fen, rating);
  const known = memory.get(key);
  if (known !== undefined) return known ?? undefined;
  let found: ExplorerStats | null = null;
  try {
    const saved = localStorage.getItem(STORE_PREFIX + key);
    if (saved) {
      const entry = JSON.parse(saved) as { at: number; stats: ExplorerStats };
      if (Date.now() - entry.at < KEEP_FOR) found = entry.stats;
      else localStorage.removeItem(STORE_PREFIX + key);
    }
  } catch {
    // Storage unavailable, or a damaged entry: ask the server again.
  }
  memory.set(key, found);
  return found ?? undefined;
}

function remember(fen: string, rating: number, stats: ExplorerStats) {
  const key = cacheKey(fen, rating);
  memory.set(key, stats);
  const entry = JSON.stringify({ at: Date.now(), stats });
  try {
    localStorage.setItem(STORE_PREFIX + key, entry);
  } catch {
    // Storage is full: start the explorer's part of it afresh.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const name = localStorage.key(i);
        if (name?.startsWith(STORE_PREFIX)) localStorage.removeItem(name);
      }
      localStorage.setItem(STORE_PREFIX + key, entry);
    } catch {
      // Storage unavailable: the answer lasts until the page reloads.
    }
  }
}

/** The chosen band first, then the others nearest it, so the chart fills in around it. */
export function loadOrder(rating: number): number[] {
  return RATING_BANDS.map((band) => band.rating).sort((a, b) => Math.abs(a - rating) - Math.abs(b - rating));
}

/**
 * Statistics for the position in every rating band, in RATING_BANDS order, undefined while a band
 * loads. The chosen band is asked first; once the position has stayed on screen for CHART_DELAY,
 * the others follow one at a time in the background, and leaving the position cancels what's left.
 */
export function useExplorerStats(fen: string, rating: number, enabled: boolean) {
  const [, setLoaded] = useState(0);
  const [error, setError] = useState<{ fen: string; rating: number; message: string } | null>(null);
  /** The chosen band's answer is taking a while: the server is likely waiting out Lichess's limit. */
  const [slow, setSlow] = useState<{ fen: string; rating: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const [chosen, ...others] = loadOrder(rating);
    const load = async (band: number, background: boolean) => {
      remember(fen, band, await api.explorer(fen, band, background, controller.signal));
      if (!controller.signal.aborted) setLoaded((n) => n + 1);
    };
    void (async () => {
      const slowTimer = setTimeout(() => setSlow({ fen, rating }), SLOW_AFTER);
      try {
        if (!cachedStats(fen, chosen)) await load(chosen, false);
      } catch (err) {
        if (!controller.signal.aborted) setError({ fen, rating, message: err instanceof Error ? err.message : String(err) });
        return;
      } finally {
        clearTimeout(slowTimer);
      }
      // Lichess allows 20 requests a minute: fill in the chart only for a position you stay on,
      // not for each one you step past.
      await new Promise((resolve) => setTimeout(resolve, CHART_DELAY));
      for (const band of others) {
        if (controller.signal.aborted) return;
        if (cachedStats(fen, band)) continue;
        try {
          await load(band, true);
        } catch {
          // The other bands only fill in the chart: without them it shows placeholders.
          return;
        }
      }
    })();
    return () => controller.abort();
  }, [fen, rating, enabled]);

  return {
    stats: RATING_BANDS.map((band) => (enabled ? cachedStats(fen, band.rating) : undefined)),
    error: error && error.fen === fen && error.rating === rating ? error.message : null,
    slow: slow?.fen === fen && slow.rating === rating && !cachedStats(fen, rating),
  };
}

export function loadBand(): number {
  try {
    const saved = localStorage.getItem(BAND_KEY);
    if (saved !== null && isBandRating(Number(saved))) return Number(saved);
  } catch {
    // Storage unavailable: use the default.
  }
  return DEFAULT_BAND;
}

export function saveBand(rating: number) {
  try {
    localStorage.setItem(BAND_KEY, String(rating));
  } catch {
    // Storage unavailable: the choice lasts until the page reloads.
  }
}
