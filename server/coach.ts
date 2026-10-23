import Anthropic from "@anthropic-ai/sdk";
import { numberedLine } from "../shared/notation";
import type { Explanation, MoveGrade, Perspective } from "../shared/types";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Claude Haiku 5.5 has no server-side refusal fallback; sending `fallbacks` to it is pointless. */
const MODELS_WITHOUT_FALLBACK = new Set(["claude-haiku-5-5"]);

const SYSTEM_PROMPT = `You are ChessBuddy, a chess coach helping an improving player understand the moves in their games.

Each request is about one move: either the player's own move or their opponent's move. You get engine facts about it: the position before the move (FEN), the moves played so far, the move itself, how the engine grades it, the engine's best moves with their lines, the best reply line, and facts computed by code (hanging pieces, material changes, mates).

Explain the move in plain language a club player understands. Ground every concrete claim in those facts: only name moves and lines that appear in them, and don't claim tactics or evaluations the facts don't support. General ideas (development, king safety, piece activity, pawn structure, threats) are fine when they follow from the given moves and position. When the move was best or excellent, explain what makes it good rather than looking for flaws.

For the player's own move, address the player as "you". For the opponent's move, explain what that move does and whether it was good or bad for the opponent, call that side "your opponent", and use the reply field to tell the player how to answer it.

The engine facts are always written from the side that played the move: "+" evaluations favour that side, "#3" means that side can force mate in 3, "-#2" means the other side can, and words like "your knight" in the computed facts mean that side's pieces. Winning chances are on a 0-100 scale for that side.

Moves and lines carry move numbers: "3. d4" is a White move and "2... Nxa6" is a Black move; a move without a number belongs to the side after the previous one. Use them to keep straight which side plays each move in a line.

Write moves in SAN and keep each field to one to three sentences.`;

const EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", description: "One short sentence: how good the move was." },
    why: { type: "string", description: "Why the move is good or bad." },
    betterMove: {
      type: "string",
      description: "What the engine preferred and the idea behind it, or why the played move was the right choice.",
    },
    reply: {
      type: "string",
      description:
        "The best reply to this move and its point. For the opponent's move, this is how the player should answer it.",
    },
    lesson: { type: "string", description: "One takeaway the player can reuse in future games." },
  },
  required: ["verdict", "why", "betterMove", "reply", "lesson"],
  additionalProperties: false,
} as const;

const CLASSIFICATION_LABEL: Record<MoveGrade["classification"], string> = {
  best: "Best move (the engine's first choice)",
  excellent: "Excellent",
  good: "Good",
  inaccuracy: "Inaccuracy",
  mistake: "Mistake",
  blunder: "Blunder",
};

export type Effort = "low" | "medium" | "high";

export interface ExplainOptions {
  model: string;
  perspective: Perspective;
}

export class CoachError extends Error {}

export class Coach {
  private client: Anthropic | null = null;

  constructor(
    readonly defaultModel: string,
    private readonly effort: Effort,
  ) {}

  get configured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }

  async explain(grade: MoveGrade, history: string[], options: ExplainOptions): Promise<Explanation> {
    if (!this.configured) {
      throw new CoachError("No Anthropic API key found. Add ANTHROPIC_API_KEY to .env and restart the server.");
    }
    this.client ??= new Anthropic();

    let response;
    try {
      response = await this.client.beta.messages.create(buildExplainRequest(grade, history, options, this.effort));
    } catch (err) {
      throw coachErrorFrom(err, options.model);
    }

    if (response.stop_reason === "refusal") {
      throw new CoachError("The coach declined to explain this move. Try again.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new CoachError("The explanation was cut off. Try again.");
    }

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") text += block.text;
    }
    try {
      return { ...(JSON.parse(text) as Omit<Explanation, "model">), model: response.model };
    } catch {
      throw new CoachError("The coach's answer couldn't be read. Try again.");
    }
  }
}

export function buildExplainRequest(
  grade: MoveGrade,
  history: string[],
  { model, perspective }: ExplainOptions,
  effort: Effort,
): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
  const fallback = MODELS_WITHOUT_FALLBACK.has(model)
    ? {}
    : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  return {
    model,
    max_tokens: 16000,
    ...fallback,
    output_config: {
      effort,
      format: { type: "json_schema", schema: EXPLANATION_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: describeMove(grade, history, perspective) }],
  };
}

/** Turns Claude API failures into messages the player can act on. Other errors pass through. */
export function coachErrorFrom(err: unknown, model: string): unknown {
  if (err instanceof Anthropic.AuthenticationError) {
    return new CoachError("Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env and restart the server.");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new CoachError(`Your API key isn't allowed to use ${model}. Pick another model.`);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new CoachError(`The model ${model} wasn't found. Pick another model.`);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new CoachError("Too many requests to the Anthropic API right now. Wait a moment and try again.");
  }
  if (err instanceof Anthropic.InternalServerError) {
    return new CoachError("The Anthropic API is busy or having trouble. Try again in a moment.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new CoachError("Couldn't reach the Anthropic API. Check your internet connection.");
  }
  if (err instanceof Anthropic.APIError) {
    const detail = (err.error as { error?: { message?: string } } | undefined)?.error?.message ?? err.message;
    return new CoachError(`The Anthropic API returned an error (${err.status}): ${detail}`);
  }
  return err;
}

function describeMove(grade: MoveGrade, history: string[], perspective: Perspective): string {
  const mover = grade.mover === "w" ? "White" : "Black";
  const other = grade.mover === "w" ? "Black" : "White";
  const played = numberedLine(grade.fenBefore, [grade.played.san]);
  const facts = {
    movedBy: mover,
    movesSoFar: history.length > 0 ? numberedLine(START_FEN, history) : "(starting position)",
    positionBeforeMove: grade.fenBefore,
    movePlayed: played,
    engineGrade: CLASSIFICATION_LABEL[grade.classification],
    evaluationBefore: grade.evalBefore,
    evaluationAfter: grade.evalAfter,
    winningChancesBefore: grade.winBefore,
    winningChancesAfter: grade.winAfter,
    engineBestMoves: grade.bestMoves.map((m) => ({
      move: m.san,
      evaluation: m.eval,
      line: numberedLine(grade.fenBefore, m.line),
    })),
    bestReplyLine: numberedLine(grade.fenAfter, grade.opponentReply) || "(game over)",
    computedFacts: grade.motifs,
  };
  const ask =
    perspective === "mine"
      ? `Explain my move ${played} (I am ${mover}).`
      : `Explain my opponent's move ${played}. My opponent is ${mover}; I am ${other}.`;
  return `${ask}\n\nEngine facts, written from ${mover}'s side:\n${JSON.stringify(facts, null, 2)}`;
}
