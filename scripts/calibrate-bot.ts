/**
 * Measures how strongly the bot plays at each rating, to tune server/bot/strength.ts.
 *
 * Builds a set of positions from bot-vs-bot games, lets the bot move in each position at
 * every rating, and reports its average centipawn loss (ACPL) and blunder rate next to
 * the target ACPL for that rating. Needs Docker and the engine image.
 *
 *   npm run calibrate            (about 100 positions, one bot move each)
 *   npm run calibrate -- 40      (fewer positions, faster, noisier)
 *   npm run calibrate -- 150 2   (150 positions, two bot moves each, steadier)
 *
 * Each worker runs its own engine container on one CPU core; set CALIBRATE_WORKERS to
 * change how many run at once (default 12, leaving room for the app on a 16-core machine).
 */
import { Chess } from "chess.js";
import { chooseBotMove, pickMove } from "../server/bot/chooseMove";
import { TARGET_ACPL, type Strength } from "../server/bot/strength";
import { McpStockfishEngine } from "../server/engine/mcpEngine";
import type { EngineScore } from "../shared/types";

const IMAGE = process.env.STOCKFISH_IMAGE ?? "chessbuddy/mcp-stockfish";
const POSITIONS = Number(process.argv[2] ?? 100);
const SAMPLES = Number(process.argv[3] ?? 1);
const WORKERS = Number(process.env.CALIBRATE_WORKERS ?? 12);
const MEASURE_DEPTH = 14;
const BLUNDER_CP = 300;
const RATINGS = Object.keys(TARGET_ACPL).map(Number);

/** Only positions within this many centipawns of equal are measured; lopsided ones hide mistakes. */
const BALANCED_CP = 300;

// One search thread keeps Stockfish deterministic, so with the seeded random numbers below
// every run measures the same positions and differences come from the strength table alone.
const engines = Array.from({ length: WORKERS }, () => new McpStockfishEngine({ image: IMAGE }, 1));

/** Small seeded PRNG (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Centipawns from the side to move's view, with mates capped at ±1000 as ACPL studies do. */
function capped(score: EngineScore): number {
  if (score.mate !== undefined) return score.mate > 0 ? 1000 : -1000;
  return Math.max(-1000, Math.min(1000, score.cp ?? 0));
}

async function pool<T, R>(items: T[], work: (item: T, engine: McpStockfishEngine) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    engines.map(async (engine) => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index], engine);
      }
    }),
  );
  return results;
}

/**
 * Settings for the games that produce test positions. Fixed, not taken from the strength
 * table, so tuning the table does not change the positions it is measured on.
 */
const POSITION_GAME_STRENGTH: Strength = { depth: 8, multipv: 4, temperature: 40, blunderChance: 0 };

/**
 * Plays seeded engine-vs-engine games at a fixed club-strong setting, so positions stay
 * close to balanced, and returns a spread of positions from opening to endgame.
 */
async function collectCandidates(count: number): Promise<string[]> {
  const games = Math.ceil(count / 15);
  let finished = 0;
  const perGame = await pool(
    Array.from({ length: games }, (_, i) => i),
    async (i, engine) => {
      const random = seeded(1000 + i);
      const game = new Chess();
      const positions: string[] = [];
      const { depth, multipv } = POSITION_GAME_STRENGTH;
      for (let ply = 0; ply < 70 && !game.isGameOver(); ply++) {
        if (ply >= 4 && ply % 4 === i % 4) positions.push(game.fen());
        const legal = game.moves({ verbose: true }).map((m) => m.lan);
        const lines = await engine.analyze(game.fen(), { multipv, depth });
        const move = pickMove(lines, legal, POSITION_GAME_STRENGTH, random);
        game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] });
      }
      console.log(`  played test game ${++finished}/${games}`);
      return positions;
    },
  );
  return perGame.flat();
}

async function main() {
  const started = Date.now();
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;
  console.log(`Calibrating with ${WORKERS} engine workers`);
  const candidates = await collectCandidates(POSITIONS * 2);

  const bestScore = new Map<string, number>();
  await pool(candidates, async (fen, engine) => {
    const [line] = await engine.analyze(fen, { multipv: 1, depth: MEASURE_DEPTH });
    bestScore.set(fen, capped(line.score));
  });
  const positions = candidates.filter((fen) => Math.abs(bestScore.get(fen)!) <= BALANCED_CP).slice(0, POSITIONS);
  console.log(
    `Measuring on ${positions.length} balanced positions (of ${candidates.length} collected) after ${elapsed()}\n`,
  );

  const afterScore = new Map<string, number>();
  console.log("rating  target ACPL  measured ACPL  blunders (>=3 pawns)  elapsed");
  const trials = positions.flatMap((fen) => Array.from({ length: SAMPLES }, () => fen)).map((fen, index) => ({ fen, index }));
  for (const rating of RATINGS) {
    const losses = await pool(trials, async ({ fen, index }, engine) => {
      const move = await chooseBotMove(engine, fen, rating, seeded(rating * 100_003 + index));
      const board = new Chess(fen);
      board.move({ from: move!.slice(0, 2), to: move!.slice(2, 4), promotion: move![4] });
      const after = board.fen();
      if (!afterScore.has(after)) {
        if (board.isCheckmate()) afterScore.set(after, -1000);
        else if (board.isGameOver()) afterScore.set(after, 0);
        else {
          const [line] = await engine.analyze(after, { multipv: 1, depth: MEASURE_DEPTH });
          afterScore.set(after, capped(line.score));
        }
      }
      // The position after the move is scored from the opponent's side.
      return Math.max(0, bestScore.get(fen)! + afterScore.get(after)!);
    });
    const acpl = losses.reduce((sum, l) => sum + l, 0) / losses.length;
    const blunders = losses.filter((l) => l >= BLUNDER_CP).length / losses.length;
    console.log(
      `${String(rating).padStart(6)}  ${String(TARGET_ACPL[rating]).padStart(11)}  ${acpl.toFixed(0).padStart(13)}  ${(blunders * 100).toFixed(0).padStart(19)}%  ${elapsed().padStart(7)}`,
    );
  }
  console.log(`\nDone in ${elapsed()}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => Promise.allSettled(engines.map((e) => e.close())));
