import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../shared/types";
import { EnginePool, gradingEngineCount } from "./pool";

/** An engine whose searches finish when the test says so, counting how many run at once. */
function fakeEngine(name: string, log: string[], running: { now: number; most: number }) {
  const pending: (() => void)[] = [];
  return {
    pending,
    warmed: 0,
    closed: 0,
    async analyze(fen: string): Promise<EngineLine[]> {
      running.now++;
      running.most = Math.max(running.most, running.now);
      log.push(`${name}:${fen}`);
      await new Promise<void>((resolve) => pending.push(resolve));
      running.now--;
      return [{ score: { cp: 0 }, pv: [fen] }];
    },
    async warmUp() {
      this.warmed++;
    },
    async close() {
      this.closed++;
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const OPTIONS = { multipv: 1, depth: 10 };

describe("EnginePool", () => {
  it("runs as many searches at once as it has engines, and queues the rest in order", async () => {
    const log: string[] = [];
    const running = { now: 0, most: 0 };
    const engines = [fakeEngine("a", log, running), fakeEngine("b", log, running)];
    const pool = new EnginePool(engines);
    const results = ["p1", "p2", "p3", "p4"].map((fen) => pool.analyze(fen, OPTIONS));
    await tick();
    expect(log).toHaveLength(2);

    // Each engine that finishes takes the next waiting search.
    engines[1].pending.shift()!();
    await tick();
    expect(log).toEqual(["b:p1", "a:p2", "b:p3"]);
    for (let i = 0; i < 4; i++) {
      for (const engine of engines) engine.pending.shift()?.();
      await tick();
    }
    expect((await Promise.all(results)).map((lines) => lines[0].pv[0])).toEqual(["p1", "p2", "p3", "p4"]);
    expect(running.most).toBe(2);
    expect(pool.size).toBe(2);
  });

  it("with one engine, searches one position at a time", async () => {
    const log: string[] = [];
    const running = { now: 0, most: 0 };
    const engine = fakeEngine("a", log, running);
    const pool = new EnginePool([engine]);
    const both = Promise.all([pool.analyze("p1", OPTIONS), pool.analyze("p2", OPTIONS)]);
    await tick();
    expect(log).toEqual(["a:p1"]);
    engine.pending.shift()!();
    await tick();
    engine.pending.shift()!();
    await both;
    expect(running.most).toBe(1);
  });

  it("frees an engine whose search failed", async () => {
    let calls = 0;
    const engine = {
      analyze: async (): Promise<EngineLine[]> => {
        calls++;
        if (calls === 1) throw new Error("engine crashed");
        return [];
      },
      warmUp: async () => {},
      close: async () => {},
    };
    const pool = new EnginePool([engine]);
    await expect(pool.analyze("p1", OPTIONS)).rejects.toThrow("engine crashed");
    await expect(pool.analyze("p2", OPTIONS)).resolves.toEqual([]);
  });

  it("warms up and closes every engine", async () => {
    const running = { now: 0, most: 0 };
    const engines = [fakeEngine("a", [], running), fakeEngine("b", [], running), fakeEngine("c", [], running)];
    const pool = new EnginePool(engines);
    await pool.warmUp();
    await pool.close();
    expect(engines.map((e) => [e.warmed, e.closed])).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
    ]);
  });
});

describe("gradingEngineCount", () => {
  it("is 1 when GRADING_ENGINES isn't set", () => {
    expect(gradingEngineCount(undefined)).toBe(1);
    expect(gradingEngineCount("")).toBe(1);
    expect(gradingEngineCount("  ")).toBe(1);
  });

  it("reads a whole number from 1 to 8", () => {
    expect(gradingEngineCount("1")).toBe(1);
    expect(gradingEngineCount(" 3 ")).toBe(3);
    expect(gradingEngineCount("8")).toBe(8);
  });

  it("refuses anything else", () => {
    for (const value of ["0", "-2", "1.5", "9", "two", "2x"]) expect(gradingEngineCount(value)).toBeNull();
  });
});
