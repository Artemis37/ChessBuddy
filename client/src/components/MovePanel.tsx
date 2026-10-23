import { useState } from "react";
import { numberedLine } from "../../../shared/notation";
import {
  COACH_MODELS,
  coachModelLabel,
  type Color,
  type ExplanationStep,
  type StatusResponse,
} from "../../../shared/types";
import { CLASSIFICATION, colorName, moveNumber, type PlayedMove } from "../game";

interface Props {
  move?: PlayedMove;
  index: number | null;
  myColor: Color;
  onBoard: boolean;
  coach: StatusResponse["coach"] | null;
  model: string;
  onModelChange: (model: string) => void;
  onExplain: (index: number) => void;
  onRetry: (index: number) => void;
  /** Grades a move: the other side's on request, or yours again after a failure. */
  onAnalyze: (index: number) => void;
  onShowOnBoard: (index: number) => void;
  /** The step the board is playing for this move (of the explanation, or of an answer), or null. */
  active: { reply: number | null; step: number } | null;
  onShowStep: (index: number, step: number, reply: number | null) => void;
  onAsk: (index: number, question: string) => void;
}

export function MovePanel({
  move,
  index,
  myColor,
  onBoard,
  coach,
  model,
  onModelChange,
  onExplain,
  onRetry,
  onAnalyze,
  onShowOnBoard,
  active,
  onShowStep,
  onAsk,
}: Props) {
  if (!move || index === null) {
    return (
      <section className="card panel">
        <h2>Move review</h2>
        <p className="muted">
          Every {colorName(myColor)} move you play gets graded here. Click any move in the list to review it, including
          your opponent's.
        </p>
      </section>
    );
  }

  const mine = move.color === myColor;
  const title = `${moveNumber(index)} ${move.san}`;
  const owner = mine ? "Your move" : `Your opponent's move (${colorName(move.color)})`;

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
        ) : (
          <>
            <p className="muted">Moves by the other side aren't graded automatically.</p>
            <div className="actions">
              <button className="primary" onClick={() => onAnalyze(index)}>
                Analyze this move
              </button>
              {!onBoard && <button onClick={() => onShowOnBoard(index)}>Show on board</button>}
            </div>
          </>
        )}
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
          {info.symbol} {info.label}
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

          {(move.thread ?? []).map((exchange, reply) => (
            <div className="exchange" key={reply}>
              <p className="question">{exchange.question}</p>
              <p className="answer">{exchange.reply.answer}</p>
              <StepList
                steps={exchange.reply.steps}
                active={active?.reply === reply ? active.step : null}
                onShow={(step) => onShowStep(index, step, reply)}
              />
              <p className="muted small">Answered by {coachModelLabel(exchange.reply.model)}</p>
            </div>
          ))}
          {move.asking && (
            <div className="exchange">
              <p className="question">{move.asking}</p>
              <p className="muted">
                <span className="spinner" /> Thinking…
              </p>
            </div>
          )}
          {move.askError && <p className="error-text">{move.askError}</p>}
          <AskBox
            disabled={Boolean(move.asking) || Boolean(move.explaining) || !coach?.ready}
            placeholder={grade.isBest ? "Ask about this move" : `Ask about this move, e.g. why not ${best?.san ?? "another move"}?`}
            onAsk={(question) => onAsk(index, question)}
          />
        </div>
      )}

      <div className="actions">
        <button
          className="primary"
          onClick={() => onExplain(index)}
          disabled={move.explaining || Boolean(move.asking) || !coach?.ready}
          title={coach?.ready ? undefined : coach?.error}
        >
          {move.explaining ? "Explaining…" : move.explanation ? "Explain again" : "Explain this move"}
        </button>
        <label className="model-picker">
          <span className="sr-only">Model</span>
          <select value={model} onChange={(e) => onModelChange(e.target.value)} disabled={move.explaining}>
            {COACH_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.note}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(!explanation && !onBoard) || (mine && weak) ? (
        <div className="actions">
          {!explanation && !onBoard && <button onClick={() => onShowOnBoard(index)}>Show on board</button>}
          {mine && weak && <button onClick={() => onRetry(index)}>Retry this move</button>}
        </div>
      ) : null}
      {!coach?.ready && <p className="muted small">{coach?.error ?? "Coach unavailable."}</p>}
      {move.explainError && <p className="error-text">{move.explainError}</p>}
    </section>
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
      <label className="sr-only" htmlFor="ask-input">
        Ask about this move
      </label>
      <input
        id="ask-input"
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
