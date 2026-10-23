import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { MoveGrade } from "../shared/types";
import { buildExplainRequest, CoachError, coachErrorFrom } from "./coach";

const GRADE: MoveGrade = {
  fenBefore: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  fenAfter: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  mover: "b",
  played: { uci: "e7e5", san: "e5" },
  classification: "best",
  isBest: true,
  winBefore: 47,
  winAfter: 47,
  winDrop: 0,
  evalBefore: "-0.30",
  evalAfter: "-0.32",
  positionBefore: { score: { cp: 30 } },
  positionAfter: { score: { cp: 32 } },
  bestMoves: [],
  opponentReply: [],
  motifs: [],
};

function userText(request: ReturnType<typeof buildExplainRequest>): string {
  return request.messages[0].content as string;
}

describe("buildExplainRequest", () => {
  it("uses the chosen model with a server-side refusal fallback", () => {
    const request = buildExplainRequest(GRADE, ["e4"], { model: "claude-opus-5-5", perspective: "mine" }, "medium");
    expect(request.model).toBe("claude-opus-5-5");
    expect(request.fallbacks).toBe("default");
    expect(request.betas).toEqual(["server-side-fallback-2026-07-01"]);
  });

  it("sends no fallback settings for Haiku, which has no server-side fallback", () => {
    const request = buildExplainRequest(GRADE, ["e4"], { model: "claude-haiku-5-5", perspective: "mine" }, "medium");
    expect(request).not.toHaveProperty("fallbacks");
    expect(request).not.toHaveProperty("betas");
  });

  it("asks about the player's own move", () => {
    const request = buildExplainRequest(GRADE, ["e4"], { model: "claude-sonnet-5-5", perspective: "mine" }, "medium");
    expect(userText(request)).toMatch(/^Explain my move 1\.\.\. e5 \(I am Black\)\./);
  });

  it("asks about the opponent's move from the player's side", () => {
    const request = buildExplainRequest(GRADE, ["e4"], { model: "claude-sonnet-5-5", perspective: "opponent" }, "medium");
    expect(userText(request)).toMatch(/^Explain my opponent's move 1\.\.\. e5\. My opponent is Black; I am White\./);
    expect(userText(request)).toContain("written from Black's side");
  });
});

function apiError(status: number, message: string) {
  return Anthropic.APIError.generate(status, { type: "error", error: { type: "x", message } }, undefined, new Headers());
}

describe("coachErrorFrom", () => {
  it.each([
    [401, /API key was rejected/],
    [403, /isn't allowed to use test-model/],
    [404, /test-model wasn't found/],
    [429, /Too many requests/],
    [529, /busy or having trouble/],
    [400, /returned an error \(400\): bad field/],
  ])("turns a %i response into a readable coach error", (status, expected) => {
    const result = coachErrorFrom(apiError(status, "bad field"), "test-model");
    expect(result).toBeInstanceOf(CoachError);
    expect((result as Error).message).toMatch(expected);
  });

  it("explains a network failure", () => {
    const result = coachErrorFrom(new Anthropic.APIConnectionError({ message: "fetch failed" }), "test-model");
    expect((result as Error).message).toMatch(/internet connection/);
  });

  it("passes other errors through unchanged", () => {
    const original = new TypeError("boom");
    expect(coachErrorFrom(original, "test-model")).toBe(original);
  });
});
