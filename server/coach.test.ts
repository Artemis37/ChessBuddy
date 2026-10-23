import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { MoveGrade } from "../shared/types";
import { buildAskRequest, buildExplainRequest, Coach, CoachError, coachErrorFrom } from "./coach";

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

  it("lists the board lines with each move numbered, for the steps to refer to", () => {
    const grade: MoveGrade = {
      ...GRADE,
      opponentReply: ["Nf3", "Nc6"],
      bestMoves: [{ uci: "e7e5", san: "e5", eval: "-0.30", line: ["e5", "Nf3"], position: { score: { cp: 30 } } }],
    };
    const request = buildExplainRequest(grade, ["e4"], { model: "claude-sonnet-5-5", perspective: "mine" }, "medium");
    const facts = JSON.parse(userText(request).slice(userText(request).indexOf("{")));
    expect(facts.boardLines.played.moves).toEqual({ "1": "1... e5", "2": "2. Nf3", "3": "2... Nc6" });
    expect(facts.boardLines.best1).toEqual({
      about: "Engine choice 1 (evaluation -0.30)",
      moves: { "1": "1... e5", "2": "2. Nf3" },
    });
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

describe("buildAskRequest", () => {
  it("replays the explanation and earlier questions before the new question", () => {
    const request = buildAskRequest(
      GRADE,
      ["e4"],
      { summary: "A solid reply.", steps: ["1... e5 claims the center."], lesson: "Fight for the center." },
      [{ question: "Why not d5?", answer: "It's fine too.", steps: ["1... d5 hits e4."] }],
      "What about c5?",
      { model: "claude-haiku-5-5", perspective: "mine" },
      "low",
    );
    expect(request.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);
    expect(request.messages[1].content).toBe("A solid reply.\nStep 1: 1... e5 claims the center.\nLesson: Fight for the center.");
    expect(request.messages[3].content).toBe("It's fine too.\nStep 1: 1... d5 hits e4.");
    expect(request.messages[4].content).toBe("What about c5?");
    expect(request.output_config?.format?.schema).toHaveProperty("properties.answer");
  });
});

describe("Coach tool loop", () => {
  // 1.e4 e5 2.Bc4 Nc6 3.Qh5, Black to move.
  const BEFORE = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3";
  const grade: MoveGrade = {
    ...GRADE,
    fenBefore: BEFORE,
    fenAfter: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    played: { uci: "g8f6", san: "Nf6" },
    opponentReply: ["Qxf7#"],
  };
  const engine = async () => [{ score: { cp: 20 }, pv: ["b1c3"] }];

  function fakeClient(responses: object[]) {
    const requests: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
    const client = {
      beta: {
        messages: {
          create: async (request: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) => {
            requests.push(structuredClone(request));
            return responses[Math.min(requests.length, responses.length) - 1];
          },
        },
      },
    } as unknown as Anthropic;
    return { client, requests };
  }

  const toolCall = {
    stop_reason: "tool_use",
    model: "claude-sonnet-5-5",
    content: [{ type: "tool_use", id: "t1", name: "try_moves", input: { line: "played", afterMove: 0, moves: ["Qf6"] } }],
  };
  const answer = {
    stop_reason: "end_turn",
    model: "claude-sonnet-5-5",
    content: [
      {
        type: "text",
        text: JSON.stringify({
          summary: "Nf6 drops f7.",
          steps: [{ caption: "3... Qf6 guards f7.", line: "try1", fromMove: 1, toMove: 2, arrows: [], marks: [] }],
          lesson: "Guard f7.",
        }),
      },
    ],
  };

  it("runs try_moves and lets the answer's steps use the new line", async () => {
    const { client, requests } = fakeClient([toolCall, answer]);
    const coach = new Coach("claude-sonnet-5-5", "medium", client);
    const explanation = await coach.explain(grade, ["e4", "e5", "Bc4", "Nc6", "Qh5"], {
      model: "claude-sonnet-5-5",
      perspective: "mine",
      engine,
    });

    expect(explanation.steps[0].moves.map((m) => m.san)).toEqual(["Qf6", "Nc3"]);
    expect(requests[0].tool_choice).toEqual({ type: "auto" });
    expect(requests[0].tools?.[0]).toMatchObject({ name: "try_moves", strict: true });
    // The tool call goes back unchanged, followed by its result.
    expect(requests[1].messages[1]).toEqual({ role: "assistant", content: toolCall.content });
    const [result] = requests[1].messages[2].content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(JSON.parse(result.content as string)).toMatchObject({ line: "try1", moves: { "1": "3... Qf6", "2": "4. Nc3" } });
  });

  it("turns tools off on the last round so the coach has to answer", async () => {
    const { client, requests } = fakeClient([toolCall, toolCall, toolCall, answer]);
    const coach = new Coach("claude-sonnet-5-5", "medium", client);
    await coach.explain(grade, [], { model: "claude-sonnet-5-5", perspective: "mine", engine });
    expect(requests.map((r) => r.tool_choice?.type)).toEqual(["auto", "auto", "auto", "none"]);
  });

  it("reports an illegal tried move back to the coach as an error", async () => {
    const illegal = { ...toolCall, content: [{ ...toolCall.content[0], input: { line: "played", afterMove: 0, moves: ["Qxf7"] } }] };
    const { client, requests } = fakeClient([illegal, answer]);
    await new Coach("claude-sonnet-5-5", "medium", client).explain(grade, [], {
      model: "claude-sonnet-5-5",
      perspective: "mine",
      engine,
    });
    const [result] = requests[1].messages[2].content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(result).toMatchObject({ is_error: true, content: expect.stringMatching(/^Qxf7 isn't legal/) });
  });
});
