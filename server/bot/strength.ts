/**
 * How the bot plays at a given rating.
 *
 * Ratings are estimates on the Chess.com scale. Stockfish's own UCI_Elo is calibrated
 * against engines rather than people and stops at 1320, so the bot weakens itself:
 * it searches only `depth` plies, picks among the engine's top `multipv` moves with a
 * preference that softens as `temperature` (centipawns) grows, and with probability
 * `blunderChance` plays a random legal move, the way beginners hang pieces.
 *
 * The anchors were tuned with `npm run calibrate` so the bot's average centipawn loss
 * roughly matches typical players at each rating (see TARGET_ACPL).
 */
export interface Strength {
  depth: number;
  multipv: number;
  temperature: number;
  blunderChance: number;
}

export const MIN_PLAYABLE_RATING = 400;
export const MAX_PLAYABLE_RATING = 2600;

const ANCHORS: Array<[rating: number, strength: Strength]> = [
  [400, { depth: 1, multipv: 10, temperature: 190, blunderChance: 0.35 }],
  [600, { depth: 1, multipv: 10, temperature: 150, blunderChance: 0.22 }],
  [800, { depth: 2, multipv: 9, temperature: 112, blunderChance: 0.14 }],
  [1000, { depth: 3, multipv: 8, temperature: 100, blunderChance: 0.08 }],
  [1200, { depth: 4, multipv: 8, temperature: 100, blunderChance: 0.035 }],
  [1400, { depth: 5, multipv: 7, temperature: 100, blunderChance: 0.03 }],
  [1600, { depth: 5, multipv: 7, temperature: 84, blunderChance: 0.02 }],
  [1800, { depth: 7, multipv: 6, temperature: 70, blunderChance: 0.005 }],
  [2000, { depth: 8, multipv: 6, temperature: 66, blunderChance: 0 }],
  [2200, { depth: 10, multipv: 5, temperature: 55, blunderChance: 0 }],
  [2400, { depth: 12, multipv: 5, temperature: 46, blunderChance: 0 }],
  [2600, { depth: 14, multipv: 4, temperature: 35, blunderChance: 0 }],
];

/**
 * Rough average centipawn loss of players at each Chess.com rating. These are estimates
 * from community figures (around 75-90 at 1000), not a measured dataset.
 */
export const TARGET_ACPL: Record<number, number> = {
  400: 160,
  600: 130,
  800: 105,
  1000: 85,
  1200: 72,
  1400: 62,
  1600: 53,
  1800: 45,
  2000: 38,
  2200: 32,
  2400: 27,
  2600: 22,
};

export function strengthFor(rating: number): Strength {
  const clamped = Math.min(MAX_PLAYABLE_RATING, Math.max(MIN_PLAYABLE_RATING, rating));
  const upper = ANCHORS.findIndex(([r]) => r >= clamped);
  const [highRating, high] = ANCHORS[upper];
  if (highRating === clamped || upper === 0) return { ...high };

  const [lowRating, low] = ANCHORS[upper - 1];
  const t = (clamped - lowRating) / (highRating - lowRating);
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    depth: Math.round(lerp(low.depth, high.depth)),
    multipv: Math.round(lerp(low.multipv, high.multipv)),
    temperature: lerp(low.temperature, high.temperature),
    blunderChance: lerp(low.blunderChance, high.blunderChance),
  };
}
