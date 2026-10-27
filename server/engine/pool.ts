import type { EngineLine } from "../../shared/types";
import type { Analyzer } from "../analysis/grade";

/** Most grading engines GRADING_ENGINES may ask for: each is a Stockfish process (locally, a container). */
export const MAX_GRADING_ENGINES = 8;

/** GRADING_ENGINES as a count of engines: 1 when it isn't set, null when it isn't a whole number from 1 to the maximum. */
export function gradingEngineCount(value: string | undefined): number | null {
  if (!value?.trim()) return 1;
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_GRADING_ENGINES ? count : null;
}

interface PooledEngine extends Analyzer {
  warmUp(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Engines that grade side by side. mcp-stockfish answers one call at a time, so each analysis
 * goes to a free engine and waits when all are busy: as many searches run at once as there are
 * engines.
 */
export class EnginePool implements PooledEngine {
  private readonly idle: PooledEngine[];
  private readonly waiting: ((engine: PooledEngine) => void)[] = [];

  constructor(private readonly engines: PooledEngine[]) {
    if (engines.length === 0) throw new Error("An engine pool needs at least one engine");
    this.idle = [...engines];
  }

  get size(): number {
    return this.engines.length;
  }

  analyze(fen: string, options: { multipv: number; depth: number }): Promise<EngineLine[]> {
    return this.run((engine) => engine.analyze(fen, options));
  }

  /** Starts every engine, so the first searches don't wait for one to start. */
  async warmUp(): Promise<void> {
    await Promise.all(this.engines.map((engine) => engine.warmUp()));
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.engines.map((engine) => engine.close()));
  }

  private async run<T>(task: (engine: PooledEngine) => Promise<T>): Promise<T> {
    const engine = this.idle.pop() ?? (await new Promise<PooledEngine>((resolve) => this.waiting.push(resolve)));
    try {
      return await task(engine);
    } finally {
      // The longest-waiting analysis gets the engine next.
      const next = this.waiting.shift();
      if (next) next(engine);
      else this.idle.push(engine);
    }
  }
}
