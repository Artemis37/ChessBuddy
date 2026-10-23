import type { CoachReply } from "../../shared/types";

/**
 * Follow-up questions about an explanation, kept as a tree the way claude.ai keeps a chat:
 * editing a question (or retrying its answer) adds a version of it next to the old one, and
 * each version keeps its own later questions. The thread shown follows the active versions.
 */
export interface Exchange {
  question: string;
  reply: CoachReply;
}

/** The versions of the question at one point of the thread. */
export interface Branches {
  versions: Version[];
  /** Index of the version shown. */
  active: number;
}

export interface Version {
  exchange: Exchange;
  /** The questions asked after this version, if any. */
  next: Branches | null;
}

/** One question of the thread shown, with which of its versions it is. */
export interface ThreadEntry {
  exchange: Exchange;
  version: number;
  versions: number;
}

/** The thread as shown: the active version at each point, in order. */
export function activePath(root: Branches | null | undefined): ThreadEntry[] {
  const path: ThreadEntry[] = [];
  for (let branches = root; branches; branches = branches.versions[branches.active].next) {
    path.push({
      exchange: branches.versions[branches.active].exchange,
      version: branches.active,
      versions: branches.versions.length,
    });
  }
  return path;
}

/**
 * Adds an answered question at `depth` of the thread shown and shows it. At the end of the
 * thread that is a new question; earlier, it is a new version of the question there, and the
 * questions after the old version stay with it.
 */
export function addExchange(root: Branches | null | undefined, depth: number, exchange: Exchange): Branches {
  if (depth === 0) {
    const versions = [...(root?.versions ?? []), { exchange, next: null }];
    return { versions, active: versions.length - 1 };
  }
  if (!root) throw new Error(`The thread has no question ${depth} to follow`);
  return withActive(root, (version) => ({ ...version, next: addExchange(version.next, depth - 1, exchange) }));
}

/** Shows another version of the question at `depth` of the thread shown, with its own later questions. */
export function showVersion(root: Branches, depth: number, version: number): Branches {
  if (depth === 0) return { ...root, active: Math.max(0, Math.min(root.versions.length - 1, version)) };
  return withActive(root, (active) => ({ ...active, next: active.next && showVersion(active.next, depth - 1, version) }));
}

function withActive(branches: Branches, change: (version: Version) => Version): Branches {
  return { ...branches, versions: branches.versions.map((v, i) => (i === branches.active ? change(v) : v)) };
}
