/**
 * How often each move is played, from the Lichess opening explorer's rated blitz and rapid games,
 * one rating band at a time.
 */

/** The explorer's time controls: those closest to the Chess.com games players review here. */
export const EXPLORER_SPEEDS = ["blitz", "rapid"] as const;

export interface RatingBand {
  /** The explorer's rating group: its games' average rating starts here, below the next band. */
  rating: number;
  /** The same players' approximate Chess.com rating. */
  chessCom: string;
  /** The band on the Lichess scale. */
  lichess: string;
  /** Short label for a chart axis. */
  short: string;
}

/**
 * The explorer's rating groups, with the matching Chess.com ratings from ChessGoals' comparison of
 * players active on both sites (July 2026): Lichess runs about 500 points higher at the bottom,
 * and the two meet around 2200.
 */
export const RATING_BANDS: RatingBand[] = [
  { rating: 0, chessCom: "under 400", lichess: "under 1000", short: "<400" },
  { rating: 1000, chessCom: "400–650", lichess: "1000–1199", short: "400" },
  { rating: 1200, chessCom: "650–950", lichess: "1200–1399", short: "650" },
  { rating: 1400, chessCom: "950–1250", lichess: "1400–1599", short: "950" },
  { rating: 1600, chessCom: "1250–1550", lichess: "1600–1799", short: "1250" },
  { rating: 1800, chessCom: "1550–1900", lichess: "1800–1999", short: "1550" },
  { rating: 2000, chessCom: "1900–2200", lichess: "2000–2199", short: "1900" },
  { rating: 2200, chessCom: "2200–2650", lichess: "2200–2499", short: "2200" },
  { rating: 2500, chessCom: "2650+", lichess: "2500+", short: "2650+" },
];

export const DEFAULT_BAND = 1400;

export function isBandRating(value: number): boolean {
  return RATING_BANDS.some((band) => band.rating === value);
}

/** Games won by each side and drawn. */
export interface Results {
  white: number;
  draws: number;
  black: number;
}

export interface ExplorerMove extends Results {
  /** In standard algebraic notation, as chess.js writes it. */
  san: string;
}

/** The games of one rating band that reached a position, and the moves played there. */
export interface ExplorerStats extends Results {
  /** The most played moves, most played first. */
  moves: ExplorerMove[];
}

export function gameCount(results: Results): number {
  return results.white + results.draws + results.black;
}

/** How the games ended, each as a percentage of them; all 0 without games. */
export function resultShares(results: Results): Results {
  const games = gameCount(results);
  const percent = (count: number) => (games > 0 ? (count / games) * 100 : 0);
  return { white: percent(results.white), draws: percent(results.draws), black: percent(results.black) };
}

/** Percentage of the position's games that went on with `san`; 0 when it wasn't played. */
export function moveShare(stats: ExplorerStats, san: string): number {
  const total = gameCount(stats);
  const move = stats.moves.find((m) => m.san === san);
  return move && total > 0 ? (gameCount(move) / total) * 100 : 0;
}

/** "47%", "<1%" for a move rarely played, "–" for one never played. */
export function formatShare(share: number): string {
  if (share <= 0) return "–";
  if (share < 1) return "<1%";
  return `${Math.round(share)}%`;
}

/** "5.2M", "410K", "37". */
export function formatGames(count: number): string {
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${Math.round(count / 1e3)}K`;
  return String(count);
}

/**
 * Orders items, such as the book moves, by how often they're played, the most played first;
 * items played as often keep their order.
 */
export function byShare<T>(items: T[], share: (item: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, share: share(item) }))
    .sort((a, b) => b.share - a.share || a.i - b.i)
    .map((entry) => entry.item);
}
