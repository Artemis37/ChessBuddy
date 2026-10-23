import { describe, expect, it } from "vitest";
import type { EngineLine } from "../../shared/types";
import { CachedAnalyzer } from "./cache";

function countingEngine() {
  const engine = {
    calls: [] as Array<{ fen: string; multipv: number; depth: number }>,
    async analyze(fen: string, options: { multipv: number; depth: number }): Promise<EngineLine[]> {
      engine.calls.push({ fen, ...options });
      return Array.from({ length: options.multipv }, (_, i) => ({ score: { cp: 50 - i * 10 }, pv: [`m${i}`] }));
    },
  };
  return engine;
}

describe("CachedAnalyzer", () => {
  it("reuses a result for the same position and depth", async () => {
    const engine = countingEngine();
    const cached = new CachedAnalyzer(engine);
    await cached.analyze("fen-a", { multipv: 3, depth: 16 });
    expect(await cached.analyze("fen-a", { multipv: 3, depth: 16 })).toHaveLength(3);
    expect(engine.calls).toHaveLength(1);
  });

  it("answers a request for fewer lines from a result with more", async () => {
    const engine = countingEngine();
    const cached = new CachedAnalyzer(engine);
    await cached.analyze("fen-a", { multipv: 3, depth: 16 });
    const lines = await cached.analyze("fen-a", { multipv: 1, depth: 16 });
    expect(lines).toEqual([{ score: { cp: 50 }, pv: ["m0"] }]);
    expect(engine.calls).toHaveLength(1);
  });

  it("asks the engine again for more lines or a different depth", async () => {
    const engine = countingEngine();
    const cached = new CachedAnalyzer(engine);
    await cached.analyze("fen-a", { multipv: 1, depth: 16 });
    await cached.analyze("fen-a", { multipv: 3, depth: 16 });
    await cached.analyze("fen-a", { multipv: 3, depth: 12 });
    expect(engine.calls).toHaveLength(3);
  });

  it("forgets the oldest positions beyond its size", async () => {
    const engine = countingEngine();
    const cached = new CachedAnalyzer(engine, 2);
    await cached.analyze("fen-a", { multipv: 1, depth: 16 });
    await cached.analyze("fen-b", { multipv: 1, depth: 16 });
    await cached.analyze("fen-c", { multipv: 1, depth: 16 });
    await cached.analyze("fen-a", { multipv: 1, depth: 16 });
    expect(engine.calls.map((c) => c.fen)).toEqual(["fen-a", "fen-b", "fen-c", "fen-a"]);
  });

  it("does not cache failures", async () => {
    let fail = true;
    const cached = new CachedAnalyzer({
      async analyze() {
        if (fail) throw new Error("engine down");
        return [{ score: { cp: 0 }, pv: ["e2e4"] }];
      },
    });
    await expect(cached.analyze("fen-a", { multipv: 1, depth: 16 })).rejects.toThrow("engine down");
    fail = false;
    expect(await cached.analyze("fen-a", { multipv: 1, depth: 16 })).toHaveLength(1);
  });
});
