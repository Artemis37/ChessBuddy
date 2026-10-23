import type { EngineLine } from "../../shared/types";
import type { Analyzer } from "./grade";

/**
 * Remembers recent analyses so the evaluation bar and move grading don't search the same
 * position twice. A result with more lines also answers a request for fewer lines.
 */
export class CachedAnalyzer implements Analyzer {
  private readonly entries = new Map<string, Promise<EngineLine[]>>();

  constructor(
    private readonly engine: Analyzer,
    private readonly size = 500,
  ) {}

  async analyze(fen: string, options: { multipv: number; depth: number }): Promise<EngineLine[]> {
    for (let multipv = options.multipv; multipv <= 10; multipv++) {
      const hit = this.entries.get(this.key(fen, multipv, options.depth));
      if (hit) return (await hit).slice(0, options.multipv);
    }

    const key = this.key(fen, options.multipv, options.depth);
    const pending = this.engine.analyze(fen, options);
    this.entries.set(key, pending);
    if (this.entries.size > this.size) this.entries.delete(this.entries.keys().next().value!);
    try {
      return await pending;
    } catch (err) {
      this.entries.delete(key);
      throw err;
    }
  }

  private key(fen: string, multipv: number, depth: number): string {
    return `${depth}|${multipv}|${fen}`;
  }
}
