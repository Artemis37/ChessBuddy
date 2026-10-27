import { useId, useState } from "react";
import { numberedLine } from "../../../shared/notation";
import {
  COACH_MODELS,
  coachModelLabel,
  type Color,
  type ExplanationStep,
  type StatusResponse,
} from "../../../shared/types";
import { CLASSIFICATION, colorName, moveNumber, type PlayedMove, type Questions } from "../game";
import { activePath, type ThreadEntry } from "../thread";
import { GradeIcon } from "./icons";

/** Index the callbacks get for the starting position, which has no move. */
export const START_INDEX = -1;

interface Props {
  move?: PlayedMove;
  index: number | null;
  /** Questions about the starting position, shown when no move is (index null). */
  start: Questions;
  myColor: Color;
  /** Playing both sides: every move is graded, and the other color is yours to move too. */
  bothSides: boolean;
  /** Learning an opening: you move both sides, and book moves are graded only when asked. */
  learning: boolean;
  /** Reviewing a game: every move of the game is graded, and you can play moves for either side. */
  reviewing: boolean;
  /** The move can be taken back to try another: yours, or one played off the line. */
  retryable: boolean;
  onBoard: boolean;
  coach: StatusResponse["coach"] | null;
  /** VIP accounts may pick every model; others can't pick VIP ones such as Opus. */
  vip: boolean;
  model: string;
  onModelChange: (model: string) => void;
  onExplain: (index: number) => void;
  onRetry: (index: number) => void;
  /** Grades a move: the other side's on request, or yours again after a failure. */
  onAnalyze: (index: number) => void;
  onShowOnBoard: (index: number) => void;
  /**
   * Playing on: the move the board has reached when it's later than this one, such as the bot's
   * reply, so its position can be asked about. Null otherwise.
   */
  boardAhead: { label: string; onPick: () => void } | null;
  /** The step the board is playing for this move (of the explanation, or of an answer), or null. */
  active: { reply: number | null; step: number } | null;
  onShowStep: (index: number, step: number, reply: number | null) => void;
  /**
   * Asks a question about the move (START_INDEX: the starting position) at the end of its
   * thread, or with `depth`, replaces the question there with a new version.
   */
  onAsk: (index: number, question: string, depth?: number) => void;
  onShowVersion: (index: number, depth: number, version: number) => void;
}

export function MovePanel({
  move,
  index,
  start,
  myColor,
  bothSides,
  learning,
  reviewing,
  retryable,
  onBoard,
  coach,
  vip,
  model,
  onModelChange,
  onExplain,
  onRetry,
  onAnalyze,
  onShowOnBoard,
  boardAhead,
  active,
  onShowStep,
  onAsk,
  onShowVersion,
}: Props) {
  const picker = <ModelPicker vip={vip} model={model} onChange={onModelChange} disabled={false} />;

  if (!move || index === null) {
    return (
      <section className="card panel">
        <h2>Starting position</h2>
        <p className="muted">
          {learning
            ? "Step to a move to review it here, and explain it to learn the idea behind it."
            : reviewing
              ? "Every move of the game, White's and Black's, gets graded. Step through it with → or click a move to review it here, and play a move on the board to try another line."
              : bothSides
                ? "Every move, White's and Black's, gets graded here. Click any move in the list to review it."
                : `Every ${colorName(myColor)} move you play gets graded here. Click any move in the list to review it, including your opponent's.`}
        </p>
        <QuestionThread
          questions={start}
          threadKey="start"
          coach={coach}
          busy={Boolean(start.asking)}
          active={active}
          placeholder="Ask about the starting position, e.g. how to begin"
          onShowStep={(step, reply) => onShowStep(START_INDEX, step, reply)}
          onAsk={(question, depth) => onAsk(START_INDEX, question, depth)}
          onShowVersion={(depth, version) => onShowVersion(START_INDEX, depth, version)}
        />
        <div className="actions">{picker}</div>
      </section>
    );
  }

  const mine = move.color === myColor;
  const title = `${moveNumber(index)} ${move.san}`;
  const owner = learning
    ? `${colorName(move.color)} · ${move.book ? "book move" : "off the book"}`
    : mine
      ? "Your move"
      : bothSides && !reviewing
        ? `The other side's move (${colorName(move.color)})`
        : `Your opponent's move (${colorName(move.color)})`;
  const busy = Boolean(move.asking) || Boolean(move.explaining) || Boolean(move.grading);
  const explainActions = (
    <div className="actions">
      <button
        className="primary"
        onClick={() => onExplain(index)}
        disabled={busy || !coach?.ready}
        title={coach?.ready ? undefined : coach?.error}
      >
        {move.explaining ? "Explaining…" : move.explanation ? "Explain again" : "Explain this move"}
      </button>
      <ModelPicker vip={vip} model={model} onChange={onModelChange} disabled={Boolean(move.explaining)} />
    </div>
  );
  const coachNotes = (
    <>
      {!coach?.ready && <p className="muted small">{coach?.error ?? "Coach unavailable."}</p>}
      {move.explainError && <p className="error-text">{move.explainError}</p>}
    </>
  );
  const questions = (placeholder: string) => (
    <>
      {boardAhead && (
        <p className="muted small board-ahead">
          Questions here are about {title}. The board has moved on:{" "}
          <button className="tool" onClick={boardAhead.onPick}>
            ask about {boardAhead.label} instead
          </button>
        </p>
      )}
      <QuestionThread
        questions={move}
        threadKey={String(move.id)}
        coach={coach}
        busy={busy}
        active={active}
        placeholder={placeholder}
        onShowStep={(step, reply) => onShowStep(index, step, reply)}
        onAsk={(question, depth) => onAsk(index, question, depth)}
        onShowVersion={(depth, version) => onShowVersion(index, depth, version)}
      />
    </>
  );

  if (move.gradeError) {
    return (
      <section className="card panel">
        <PanelTitle title={title} owner={owner} />
        <p className="error-text">Couldn't analyze this move: {move.gradeError}</p>
        <button onClick={() => onAnalyze(index)}>Try again</button>
      </section>
    );
  }

  const grade = move.grade;
  if (!grade) {
    const analyzing = move.grading || move.graded;
    return (
      <section className="card panel">
        <PanelTitle title={title} owner={owner} />
        {analyzing ? (
          <p className="muted">
            <span className="spinner" /> Analyzing with Stockfish…
          </p>
        ) : learning ? (
          <>
            <p className="muted">A book move, part of the opening's theory. Explain it to learn the idea behind it.</p>
            <div className="actions">
              <button onClick={() => onAnalyze(index)}>Analyze this move</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Moves by the other side aren't graded automatically.</p>
            <div className="actions">
              <button onClick={() => onAnalyze(index)}>Analyze this move</button>
              {!onBoard && <button onClick={() => onShowOnBoard(index)}>Show on board</button>}
            </div>
          </>
        )}
        {questions("Ask about this move or the position")}
        {explainActions}
        {coachNotes}
      </section>
    );
  }

  const info = CLASSIFICATION[grade.classification];
  const best = grade.bestMoves[0];
  const weak = ["inaccuracy", "mistake", "blunder"].includes(grade.classification);
  const explanation = move.explanation;

  return (
    <section className="card panel">
      <div className="panel-head">
        <PanelTitle title={title} owner={owner} />
        <span className={`tag ${grade.classification}`}>
          <GradeIcon kind={grade.classification} /> {info.label}
        </span>
      </div>

      <p className="facts-line">
        Evaluation{mine ? "" : ` (${colorName(move.color)})`} {grade.evalBefore} → <strong>{grade.evalAfter}</strong> ·
        Winning chances {Math.round(grade.winBefore)}% → <strong>{Math.round(grade.winAfter)}%</strong>
        {grade.winDrop >= 1 && <span className="drop"> (−{Math.round(grade.winDrop)})</span>}
      </p>

      {/* Once explained, the steps show these lines on the board instead. */}
      {!explanation && (
        <>
          <dl className="facts">
            {best && !grade.isBest && (
              <>
                <dt>Engine's best</dt>
                <dd>
                  <strong>{best.san}</strong> ({best.eval}){" "}
                  <span className="line">{numberedLine(grade.fenBefore, best.line)}</span>
                </dd>
              </>
            )}
            {grade.opponentReply.length > 0 && (
              <>
                <dt>{mine ? "Opponent's best reply" : "Your best reply"}</dt>
                <dd className="line">{numberedLine(grade.fenAfter, grade.opponentReply)}</dd>
              </>
            )}
          </dl>

          {grade.motifs.length > 0 && (
            <ul className="motifs">
              {grade.motifs.map((m) => (
                <li key={m}>{mine ? m : m.replace(/\bYour\b/g, "Their").replace(/\byour\b/g, "their")}</li>
              ))}
            </ul>
          )}
        </>
      )}

      {explanation && (
        <div className="explanation">
          <p className="summary">{explanation.summary}</p>
          <StepList
            steps={explanation.steps}
            active={active?.reply === null ? active.step : null}
            onShow={(step) => onShowStep(index, step, null)}
          />
          <h3>Lesson</h3>
          <p>{explanation.lesson}</p>
          <p className="muted small explained-by">Explained by {coachModelLabel(explanation.model)}</p>
        </div>
      )}

      {questions(
        !explanation
          ? "Ask about this move or the position"
          : grade.isBest
            ? "Ask about this move"
            : `Ask about this move, e.g. why not ${best?.san ?? "another move"}?`,
      )}

      {explainActions}
      {(!explanation && !onBoard) || (retryable && weak) ? (
        <div className="actions">
          {!explanation && !onBoard && <button onClick={() => onShowOnBoard(index)}>Show on board</button>}
          {retryable && weak && <button onClick={() => onRetry(index)}>Retry this move</button>}
        </div>
      ) : null}
      {coachNotes}
    </section>
  );
}

/**
 * The model picker. Models only VIP accounts may use are disabled for other accounts; the server
 * refuses them anyway.
 */
function ModelPicker({
  vip,
  model,
  onChange,
  disabled,
}: {
  vip: boolean;
  model: string;
  onChange: (model: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="model-picker">
      <span className="sr-only">Model</span>
      <select value={model} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {COACH_MODELS.map((m) => (
          <option key={m.id} value={m.id} disabled={m.vip && !vip}>
            {m.label} · {m.vip && !vip ? "VIP accounts only" : m.note}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Questions about a move or the starting position and the coach's answers, with the box to ask
 * the next one. They work with or without an explanation before them.
 */
function QuestionThread({
  questions,
  threadKey,
  coach,
  busy,
  active,
  placeholder,
  onShowStep,
  onAsk,
  onShowVersion,
}: {
  questions: Questions;
  threadKey: string;
  coach: StatusResponse["coach"] | null;
  busy: boolean;
  active: { reply: number | null; step: number } | null;
  placeholder: string;
  onShowStep: (step: number, reply: number) => void;
  onAsk: (question: string, depth?: number) => void;
  onShowVersion: (depth: number, version: number) => void;
}) {
  const thread = activePath(questions.thread);
  return (
    <div className="questions">
      {/* While a question is answered, the thread shows only what the coach was given. */}
      {thread.slice(0, questions.asking?.depth).map((entry, depth) => (
        <ExchangeView
          key={`${threadKey}-${depth}-${entry.version}`}
          entry={entry}
          canAsk={!busy && Boolean(coach?.ready)}
          canSwitch={!busy}
          active={active?.reply === depth ? active.step : null}
          onShowStep={(step) => onShowStep(step, depth)}
          onAsk={(question) => onAsk(question, depth)}
          onShowVersion={(version) => onShowVersion(depth, version)}
        />
      ))}
      {questions.asking && (
        <div className="exchange">
          <p className="question">{questions.asking.question}</p>
          <p className="muted">
            <span className="spinner" /> Thinking…
          </p>
        </div>
      )}
      {questions.askError && <p className="error-text">{questions.askError}</p>}
      <AskBox disabled={busy || !coach?.ready} placeholder={placeholder} onAsk={(question) => onAsk(question)} />
    </div>
  );
}

/** Numbered steps that play on the board when clicked, with previous / replay / next controls. */
function StepList({
  steps,
  active,
  onShow,
}: {
  steps: ExplanationStep[];
  active: number | null;
  onShow: (step: number) => void;
}) {
  if (steps.length === 0) return null;
  return (
    <>
      <ol className="steps">
        {steps.map((step, i) => (
          <li key={i}>
            <button
              className={`step ${i === active ? "on" : ""}`}
              aria-current={i === active ? "step" : undefined}
              onClick={() => onShow(i)}
            >
              <span className="step-no">{i + 1}</span>
              <span>{step.caption}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="step-nav">
        <button aria-label="Previous step" title="Previous step (←)" onClick={() => onShow(Math.max(0, (active ?? 0) - 1))}>
          <StepIcon kind="previous" />
        </button>
        <button aria-label="Replay step" title="Replay step" onClick={() => onShow(active ?? 0)}>
          <StepIcon kind="replay" />
        </button>
        <button
          aria-label="Next step"
          title="Next step (→)"
          onClick={() => onShow(Math.min(steps.length - 1, (active ?? -1) + 1))}
        >
          <StepIcon kind="next" />
        </button>
      </div>
    </>
  );
}

/**
 * A question and its answer, as on claude.ai: Edit asks a changed question in its place and
 * Retry asks it again, each making a new version; the arrows switch between versions.
 */
function ExchangeView({
  entry,
  canAsk,
  canSwitch,
  active,
  onShowStep,
  onAsk,
  onShowVersion,
}: {
  entry: ThreadEntry;
  canAsk: boolean;
  canSwitch: boolean;
  active: number | null;
  onShowStep: (step: number) => void;
  onAsk: (question: string) => void;
  onShowVersion: (version: number) => void;
}) {
  const { exchange, version, versions } = entry;
  /** The question being edited, or null. */
  const [draft, setDraft] = useState<string | null>(null);
  const inputId = useId();
  const edited = draft?.trim() ?? "";
  const canSend = canAsk && edited !== "" && edited !== exchange.question;
  const send = () => {
    if (canSend) onAsk(edited);
  };

  return (
    <div className="exchange">
      {draft === null ? (
        <>
          <p className="question">{exchange.question}</p>
          <div className="question-tools">
            {versions > 1 && (
              <span className="versions">
                <button
                  className="tool"
                  aria-label="Previous version"
                  disabled={!canSwitch || version === 0}
                  onClick={() => onShowVersion(version - 1)}
                >
                  ‹
                </button>
                {version + 1} / {versions}
                <button
                  className="tool"
                  aria-label="Next version"
                  disabled={!canSwitch || version === versions - 1}
                  onClick={() => onShowVersion(version + 1)}
                >
                  ›
                </button>
              </span>
            )}
            <button
              className="tool"
              disabled={!canAsk}
              title="Change this question. The answers after it stay with the old version."
              onClick={() => setDraft(exchange.question)}
            >
              ✎ Edit
            </button>
          </div>
        </>
      ) : (
        <form
          className="edit-question"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            Edit the question
          </label>
          <textarea
            id={inputId}
            value={draft}
            rows={2}
            maxLength={500}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              } else if (e.key === "Escape") setDraft(null);
            }}
          />
          <div className="actions">
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={!canSend}>
              Send
            </button>
          </div>
        </form>
      )}
      <p className="answer">{exchange.reply.answer}</p>
      <StepList steps={exchange.reply.steps} active={active} onShow={onShowStep} />
      <p className="muted small answered-by">
        Answered by {coachModelLabel(exchange.reply.model)}
        <button
          className="tool"
          disabled={!canAsk}
          title="Ask the same question again for another answer"
          onClick={() => onAsk(exchange.question)}
        >
          ↻ Retry
        </button>
      </p>
    </div>
  );
}

/** A one-line question box; Enter sends. */
function AskBox({
  disabled,
  placeholder,
  onAsk,
}: {
  disabled: boolean;
  placeholder: string;
  onAsk: (question: string) => void;
}) {
  const [text, setText] = useState("");
  const inputId = useId();
  const send = () => {
    const question = text.trim();
    if (!question || disabled) return;
    onAsk(question);
    setText("");
  };
  return (
    <form
      className="ask"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label className="sr-only" htmlFor={inputId}>
        Ask the coach
      </label>
      <input
        id={inputId}
        value={text}
        maxLength={500}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" disabled={disabled || !text.trim()}>
        Ask
      </button>
    </form>
  );
}

function StepIcon({ kind }: { kind: "previous" | "replay" | "next" }) {
  const path =
    kind === "previous"
      ? "M15 5l-7 7 7 7"
      : kind === "next"
        ? "M9 5l7 7-7 7"
        : "M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4";
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={path} />
    </svg>
  );
}

function PanelTitle({ title, owner }: { title: string; owner: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p className="owner">{owner}</p>
    </div>
  );
}
