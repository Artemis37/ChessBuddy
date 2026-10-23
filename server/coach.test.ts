import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { CoachError, coachErrorFrom } from "./coach";

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
