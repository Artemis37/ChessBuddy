import type { EngineLine, EngineScore } from "../../shared/types";

/**
 * Collects the final principal variation for each multipv slot from raw UCI output.
 * Bound scores (lowerbound/upperbound) are skipped because they are not exact.
 */
export function parseLines(output: string[]): EngineLine[] {
  const slots = new Map<number, { depth: number; line: EngineLine }>();

  for (const raw of output) {
    if (!raw.startsWith("info ") || !raw.includes(" score ")) continue;
    const tokens = raw.split(/\s+/);
    if (tokens.includes("lowerbound") || tokens.includes("upperbound")) continue;

    const depth = numberAfter(tokens, "depth") ?? 0;
    const slot = numberAfter(tokens, "multipv") ?? 1;
    const scoreAt = tokens.indexOf("score");
    const kind = tokens[scoreAt + 1];
    const value = Number(tokens[scoreAt + 2]);
    if (Number.isNaN(value) || (kind !== "cp" && kind !== "mate")) continue;

    const score: EngineScore = kind === "cp" ? { cp: value } : { mate: value };
    const pvAt = tokens.indexOf("pv");
    const pv = pvAt === -1 ? [] : tokens.slice(pvAt + 1).filter(Boolean);

    const current = slots.get(slot);
    if (!current || depth >= current.depth) {
      slots.set(slot, { depth, line: { score, pv } });
    }
  }

  return [...slots.entries()].sort(([a], [b]) => a - b).map(([, entry]) => entry.line);
}

export function parseBestMove(output: string[]): string | null {
  const line = output.find((l) => l.startsWith("bestmove"));
  const move = line?.split(/\s+/)[1];
  return move && move !== "(none)" ? move : null;
}

function numberAfter(tokens: string[], key: string): number | undefined {
  const at = tokens.indexOf(key);
  if (at === -1) return undefined;
  const value = Number(tokens[at + 1]);
  return Number.isNaN(value) ? undefined : value;
}
