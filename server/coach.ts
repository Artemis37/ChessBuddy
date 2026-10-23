import Anthropic from "@anthropic-ai/sdk";
import { numberedLine, numberedMoves } from "../shared/notation";
import type { CoachReply, Explanation, FollowUp, MoveGrade, OpeningContext, Perspective } from "../shared/types";
import {
  boardLines,
  bookLine,
  buildSteps,
  tryMoves,
  type BoardLine,
  type LineEngine,
  type StepPlan,
  type TryMovesInput,
} from "./analysis/walkthrough";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Claude Haiku 5.5 has no server-side refusal fallback; sending `fallbacks` to it is pointless. */
const MODELS_WITHOUT_FALLBACK = new Set(["claude-haiku-5-5"]);

/** Rounds of try_moves calls before the coach must answer with what it has. */
const MAX_TOOL_ROUNDS = 3;

const SYSTEM_PROMPT = `You are ChessBuddy, a chess coach helping an improving player understand the moves in their games. You explain one move at a time, briefly, by showing it on the board.

Each request is about one move: either the player's own move or their opponent's move. You get engine facts about it: the position before the move (FEN), the moves played so far, the move itself, how the engine grades it, the board lines you can show, and facts computed by code (hanging pieces, material changes, mates).

Your explanation is a one-sentence summary, two to four steps, and a one-line lesson. Each step plays moves from one board line, then may draw arrows and outline squares, and its caption says in one sentence what those moves show. A step plays moves fromMove to toMove of its line (numbered from 1); the board starts the step from the position just before fromMove, so a step can start partway into a line. Typical steps:
- A weak move: the move and what it neglects, the reply that punishes it, then the better move.
- A good move: the move, its idea or threat, then the best reply.
- The opponent's move: what it does or threatens, then how the player should answer it (the reply moves of the "played" line).

Show, don't tell: every move you name should be played on the board by a step, and no line should exist only as text. To show a move that isn't in the board lines (a tempting alternative, a mistake to avoid, a move the player asks about), call try_moves first: it plays your moves, lets the engine continue with best play, and returns a new board line for your steps.

After the explanation, the player may ask follow-up questions. Answer in at most 40 words and let zero to three steps do the showing, using the board lines or new ones from try_moves. When the question is about a move or a line, show it.

Arrows and outlines appear after the step's moves are played, so they must be true in that position: an arrow goes from a piece to a square it attacks, defends or can move to. Use them sparingly, at most two of each per step.

Be brief: the summary at most 12 words, each caption at most 20 words, the lesson at most 15 words. Write in plain language a club player understands.

Ground every concrete claim in the facts and in try_moves results: only name moves that appear in the board lines, and don't claim tactics or evaluations they don't support. General ideas (development, king safety, piece activity, pawn structure, threats) are fine when they follow from the given moves and position. When the move was best or excellent, explain what makes it good rather than looking for flaws.

For the player's own move, address the player as "you". For the opponent's move, call that side "your opponent".

Some requests come from a player learning an opening, with facts about it. Explain such a move as opening theory: what it is for (development, the centre, king safety, a pawn break, a typical piece placement), the plan it belongs to, and a trap or common mistake to know about. The "book" board line, when given, is how the line the player is learning goes on: show the plan with it rather than with the engine's lines, which may leave that line. Book moves are established theory, so don't call them mistakes over small engine differences, though you may say when the engine dislikes a gambit or sideline. For a move off the book, compare it with the book move and show both.

The engine facts are always written from the side that played the move: "+" evaluations favour that side, "#3" means that side can force mate in 3, "-#2" means the other side can, and words like "your knight" in the computed facts mean that side's pieces. Winning chances are on a 0-100 scale for that side.

Moves carry move numbers: "3. d4" is a White move and "2... Nxa6" is a Black move. Write moves in SAN with their numbers as the board lines give them.`;

const STEP_SCHEMA = {
  type: "object",
  properties: {
    caption: { type: "string", description: "One sentence, at most 20 words, about what this step's moves show." },
    line: {
      type: "string",
      description: 'The board line this step plays moves from: "played", "best1" to "best3", or a line from try_moves.',
    },
    fromMove: { type: "integer", description: "First move of the line to play; 1 is the line's first move." },
    toMove: { type: "integer", description: "Last move of the line to play." },
    arrows: {
      type: "array",
      description: "Attacks, defences or threats in the position after this step's moves. Often empty.",
      items: {
        type: "object",
        properties: {
          from: { type: "string", description: "Square of the piece, such as c4." },
          to: { type: "string", description: "Square it attacks, defends or can move to." },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
    marks: {
      type: "array",
      description: "Squares to outline after this step's moves: a hanging piece, a weak square, a mated king. Often empty.",
      items: { type: "string" },
    },
  },
  required: ["caption", "line", "fromMove", "toMove", "arrows", "marks"],
  additionalProperties: false,
} as const;

const EXPLANATION_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One short sentence, at most 12 words: the main point about the move." },
    steps: {
      type: "array",
      description: "Two to four steps that show the point on the board, in order.",
      items: STEP_SCHEMA,
    },
    lesson: { type: "string", description: "One takeaway, at most 15 words, the player can reuse in future games." },
  },
  required: ["summary", "steps", "lesson"],
  additionalProperties: false,
} as const;

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", description: "The answer to the question, at most 40 words." },
    steps: {
      type: "array",
      description: "Zero to three steps that show the answer on the board, in order.",
      items: STEP_SCHEMA,
    },
  },
  required: ["answer", "steps"],
  additionalProperties: false,
} as const;

const TRY_MOVES_TOOL: Anthropic.Beta.BetaTool = {
  name: "try_moves",
  description:
    "Plays moves that aren't in the board lines, such as an alternative or a move the player asks about, and lets the engine continue with its best play. Branches from a point in an existing board line. Returns a new board line, numbered from the same start as the line you branched from, that steps can show, with the engine's evaluation after the tried moves (from the side that played the explained move). Returns an error listing the legal moves if a move is illegal.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      line: { type: "string", description: 'Board line to branch from, such as "played" or "best1".' },
      afterMove: {
        type: "integer",
        description: "How many moves of that line to play before your moves; 0 starts from the line's first position.",
      },
      moves: {
        type: "array",
        items: { type: "string" },
        description: "Moves to try in SAN, in order, starting with the side to move at that point. Usually one to three.",
      },
    },
    required: ["line", "afterMove", "moves"],
    additionalProperties: false,
  },
};

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
  /** Engine for the try_moves tool; without it the coach can only show the lines it was given. */
  engine?: LineEngine;
  /** Set when the player is learning an opening. */
  opening?: OpeningContext;
}

/** The explanation the player is asking about, as text. */
export interface ExplanationText {
  summary: string;
  steps: string[];
  lesson: string;
}

interface StepsAnswer {
  steps: StepPlan[];
}

type Request = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

export class CoachError extends Error {}

export class Coach {
  constructor(
    readonly defaultModel: string,
    private readonly effort: Effort,
    /** Created on first use from the environment's API key; tests pass their own. */
    private client: Anthropic | null = null,
  ) {}

  get configured(): boolean {
    return this.client !== null || Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }

  async explain(grade: MoveGrade, history: string[], options: ExplainOptions): Promise<Explanation> {
    const lines = await linesFor(grade, options);
    const { answer, model } = await this.run<StepsAnswer & { summary: string; lesson: string }>(
      buildExplainRequest(grade, history, options, this.effort, lines),
      lines,
      grade,
      options.engine,
      "explain this move",
    );
    return { summary: answer.summary, steps: buildSteps(lines, answer.steps), lesson: answer.lesson, model };
  }

  async ask(
    grade: MoveGrade,
    history: string[],
    explanation: ExplanationText,
    thread: FollowUp[],
    question: string,
    options: ExplainOptions,
  ): Promise<CoachReply> {
    const lines = await linesFor(grade, options);
    const { answer, model } = await this.run<StepsAnswer & { answer: string }>(
      buildAskRequest(grade, history, explanation, thread, question, options, this.effort, lines),
      lines,
      grade,
      options.engine,
      "answer",
    );
    return { answer: answer.answer, steps: buildSteps(lines, answer.steps), model };
  }

  /**
   * Sends the request and runs the coach's try_moves calls until it answers. New lines the
   * tool creates are added to `lines`, so the answer's steps can use them.
   */
  private async run<T>(
    request: Request,
    lines: Record<string, BoardLine>,
    grade: MoveGrade,
    engine: LineEngine | undefined,
    task: string,
  ): Promise<{ answer: T; model: string }> {
    if (!this.configured) {
      throw new CoachError("No Anthropic API key found. Add ANTHROPIC_API_KEY to .env and restart the server.");
    }
    this.client ??= new Anthropic();
    const messages = [...request.messages];

    for (let round = 0; ; round++) {
      // On the last round tools are off, so the coach answers with the lines it has.
      const tools: Partial<Request> = engine
        ? { tools: [TRY_MOVES_TOOL], tool_choice: { type: round < MAX_TOOL_ROUNDS ? "auto" : "none" } }
        : {};
      let response;
      try {
        response = await this.client.beta.messages.create({ ...request, ...tools, messages });
      } catch (err) {
        throw coachErrorFrom(err, request.model);
      }

      if (response.stop_reason === "refusal") {
        throw new CoachError(`The coach declined to ${task}. Try again.`);
      }
      if (response.stop_reason === "max_tokens") {
        throw new CoachError("The coach's answer was cut off. Try again.");
      }

      if (response.stop_reason === "tool_use" && engine) {
        // The whole turn goes back unchanged, thinking blocks included.
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        // One at a time: the engine connection answers one request at a time anyway.
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          results.push(await runTryMoves(block, lines, grade, engine));
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      let text = "";
      for (const block of response.content) {
        if (block.type === "text") text += block.text;
      }
      try {
        return { answer: JSON.parse(text) as T, model: response.model };
      } catch {
        throw new CoachError("The coach's answer couldn't be read. Try again.");
      }
    }
  }
}

/** The engine's lines for the move, plus the opening book's line when the player is learning an opening. */
async function linesFor(grade: MoveGrade, { opening, engine }: ExplainOptions): Promise<Record<string, BoardLine>> {
  const lines = boardLines(grade);
  if (opening && opening.line.length > 0 && engine) {
    const book = await bookLine(grade.fenBefore, opening.line, engine, grade.positionBefore);
    if (book) lines.book = book;
  }
  return lines;
}

async function runTryMoves(
  block: Anthropic.Beta.BetaToolUseBlock,
  lines: Record<string, BoardLine>,
  grade: MoveGrade,
  engine: LineEngine,
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const fail = (message: string) => ({ type: "tool_result" as const, tool_use_id: block.id, content: message, is_error: true });
  if (block.name !== "try_moves") return fail(`Unknown tool ${block.name}.`);
  let result;
  try {
    result = await tryMoves(lines, block.input as TryMovesInput, grade.mover, engine);
  } catch (err) {
    return fail(`The engine couldn't analyze that: ${err instanceof Error ? err.message : String(err)}`);
  }
  if ("error" in result) return fail(result.error);
  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: JSON.stringify({
      line: result.id,
      moves: numberedMoveMap(result.line),
      triedMoves: `moves ${result.firstTried} to ${result.lastTried}; the engine's best play follows`,
      evaluationAfterTriedMoves: result.evaluation,
    }),
  };
}

function baseRequest(model: string, effort: Effort, schema: { [key: string]: unknown }): Omit<Request, "messages"> {
  const fallback = MODELS_WITHOUT_FALLBACK.has(model)
    ? {}
    : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };
  return {
    model,
    max_tokens: 16000,
    ...fallback,
    output_config: { effort, format: { type: "json_schema", schema } },
    system: SYSTEM_PROMPT,
  };
}

export function buildExplainRequest(
  grade: MoveGrade,
  history: string[],
  { model, perspective, opening }: ExplainOptions,
  effort: Effort,
  lines = boardLines(grade),
): Request {
  return {
    ...baseRequest(model, effort, EXPLANATION_SCHEMA),
    messages: [{ role: "user", content: describeMove(grade, history, perspective, lines, opening) }],
  };
}

/** The explanation and earlier questions are replayed as text, followed by the new question. */
export function buildAskRequest(
  grade: MoveGrade,
  history: string[],
  explanation: ExplanationText,
  thread: FollowUp[],
  question: string,
  { model, perspective, opening }: ExplainOptions,
  effort: Effort,
  lines = boardLines(grade),
): Request {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: describeMove(grade, history, perspective, lines, opening) },
    {
      role: "assistant",
      content: `${explanation.summary}\n${stepList(explanation.steps)}\nLesson: ${explanation.lesson}`,
    },
  ];
  for (const earlier of thread) {
    messages.push({ role: "user", content: earlier.question });
    messages.push({ role: "assistant", content: `${earlier.answer}\n${stepList(earlier.steps)}` });
  }
  messages.push({ role: "user", content: question });
  return { ...baseRequest(model, effort, REPLY_SCHEMA), messages };
}

function stepList(captions: string[]): string {
  return captions.map((caption, i) => `Step ${i + 1}: ${caption}`).join("\n");
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

function numberedMoveMap(line: BoardLine): Record<string, string> {
  return Object.fromEntries(numberedMoves(line.fen, line.moves).map((move, i) => [String(i + 1), move]));
}

function describeMove(
  grade: MoveGrade,
  history: string[],
  perspective: Perspective,
  lines: Record<string, BoardLine>,
  opening?: OpeningContext,
): string {
  const mover = grade.mover === "w" ? "White" : "Black";
  const other = grade.mover === "w" ? "Black" : "White";
  const played = numberedLine(grade.fenBefore, [grade.played.san]);
  const about: Record<string, string> = {
    played: `The move played, then the engine's best play for both sides (evaluation after the move: ${grade.evalAfter})`,
    book: "The opening book's line from the position before the move: how the opening usually goes on",
  };
  grade.bestMoves.forEach((best, i) => {
    about[`best${i + 1}`] = `Engine choice ${i + 1} (evaluation ${best.eval})`;
  });
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
    boardLines: Object.fromEntries(
      Object.entries(lines).map(([id, line]) => [id, { about: about[id], moves: numberedMoveMap(line) }]),
    ),
    computedFacts: grade.motifs,
    ...(opening && { opening: openingFacts(grade, opening) }),
  };
  const ask = opening
    ? openingQuestion(played, mover, perspective === "mine" ? mover : other, opening, grade.fenBefore)
    : perspective === "mine"
      ? `Explain my move ${played} (I am ${mover}).`
      : `Explain my opponent's move ${played}. My opponent is ${mover}; I am ${other}.`;
  return `${ask}\n\nEngine facts, written from ${mover}'s side:\n${JSON.stringify(facts, null, 2)}`;
}

/** Book moves named in the facts; the rest are rarely played. */
const MAX_BOOK_MOVES = 6;

function bookMoveList(fen: string, moves: string[]): string[] {
  return moves.slice(0, MAX_BOOK_MOVES).map((san) => numberedLine(fen, [san]));
}

function openingFacts(grade: MoveGrade, opening: OpeningContext) {
  return {
    learning: opening.studying,
    positionAfterMoveIsCalled: opening.reached ?? "(no name of its own)",
    isBookMove: opening.bookMove,
    bookMovesInPositionBefore:
      opening.bookMoves.length > 0 ? bookMoveList(grade.fenBefore, opening.bookMoves) : "none: the position is past the opening book",
  };
}

function openingQuestion(played: string, mover: string, side: string, opening: OpeningContext, fen: string): string {
  const learning = `I'm learning the ${opening.studying} as ${side}.`;
  if (opening.bookMove) {
    return `${learning} Explain ${played}, a book move for ${mover}: the idea behind it, the plan it belongs to, and what to watch for.`;
  }
  if (opening.bookMoves.length > 0) {
    const book = bookMoveList(fen, opening.bookMoves).slice(0, 3).join(" or ");
    return `${learning} Instead of a book move (${book}), ${mover} played ${played}. Explain how it compares with the book.`;
  }
  return `${learning} The moves have left the opening book. Explain ${mover}'s move ${played}.`;
}
