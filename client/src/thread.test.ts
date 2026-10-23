import { describe, expect, it } from "vitest";
import { activePath, addExchange, showVersion, type Branches, type Exchange } from "./thread";

function exchange(question: string): Exchange {
  return { question, reply: { answer: `Answer to ${question}`, steps: [], model: "claude-sonnet-5-5" } };
}

function questions(root: Branches | null): string[] {
  return activePath(root).map((entry) => `${entry.exchange.question} ${entry.version + 1}/${entry.versions}`);
}

describe("thread", () => {
  // Why g6? -> What about Qf6? -> And Ke7?
  const asked = [exchange("Why g6?"), exchange("What about Qf6?"), exchange("And Ke7?")].reduce<Branches | null>(
    (root, e, depth) => addExchange(root, depth, e),
    null,
  ) as Branches;

  it("is empty before any question", () => {
    expect(activePath(null)).toEqual([]);
  });

  it("adds questions at the end, one version each", () => {
    expect(questions(asked)).toEqual(["Why g6? 1/1", "What about Qf6? 1/1", "And Ke7? 1/1"]);
  });

  it("makes an edited question a new version that starts without later questions", () => {
    const edited = addExchange(asked, 1, exchange("What about Nh6?"));
    expect(questions(edited)).toEqual(["Why g6? 1/1", "What about Nh6? 2/2"]);
  });

  it("brings back the old version with the questions that followed it", () => {
    const edited = addExchange(asked, 1, exchange("What about Nh6?"));
    expect(questions(showVersion(edited, 1, 0))).toEqual(["Why g6? 1/1", "What about Qf6? 1/2", "And Ke7? 1/1"]);
  });

  it("keeps each version's own later questions", () => {
    let root = addExchange(asked, 1, exchange("What about Nh6?"));
    root = addExchange(root, 2, exchange("Then Bc5?"));
    root = showVersion(root, 1, 0);
    expect(questions(root)).toEqual(["Why g6? 1/1", "What about Qf6? 1/2", "And Ke7? 1/1"]);
    root = showVersion(root, 1, 1);
    expect(questions(root)).toEqual(["Why g6? 1/1", "What about Nh6? 2/2", "Then Bc5? 1/1"]);
  });

  it("can branch the first question too", () => {
    const edited = addExchange(asked, 0, exchange("Why not d5?"));
    expect(questions(edited)).toEqual(["Why not d5? 2/2"]);
    expect(questions(showVersion(edited, 0, 0))).toHaveLength(3);
  });

  it("keeps a version number in range", () => {
    expect(questions(showVersion(asked, 0, 5))).toEqual(questions(asked));
  });

  it("leaves the thread it was given unchanged", () => {
    const before = JSON.stringify(asked);
    showVersion(addExchange(asked, 1, exchange("What about Nh6?")), 1, 0);
    expect(JSON.stringify(asked)).toBe(before);
  });
});
