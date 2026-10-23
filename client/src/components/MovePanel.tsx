import { numberedLine } from "../../../shared/notation";
import { COACH_MODELS, coachModelLabel, type Color, type StatusResponse } from "../../../shared/types";
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

  return (
    <section className="card panel">
      <div className="panel-head">
        <PanelTitle title={title} owner={owner} />
        <span className={`tag ${grade.classification}`}>
          {info.symbol} {info.label}
        </span>
      </div>

      <dl className="facts">
        <dt>Evaluation{mine ? "" : ` (${colorName(move.color)})`}</dt>
        <dd>
          {grade.evalBefore} → <strong>{grade.evalAfter}</strong>
        </dd>
        <dt>Winning chances</dt>
        <dd>
          {Math.round(grade.winBefore)}% → <strong>{Math.round(grade.winAfter)}%</strong>
          {grade.winDrop >= 1 && <span className="drop"> (−{Math.round(grade.winDrop)})</span>}
        </dd>
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

      <div className="actions">
        <button
          className="primary"
          onClick={() => onExplain(index)}
          disabled={move.explaining || !coach?.ready}
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
      <div className="actions">
        {!onBoard && <button onClick={() => onShowOnBoard(index)}>Show on board</button>}
        {mine && weak && <button onClick={() => onRetry(index)}>Retry this move</button>}
      </div>
      {!coach?.ready && <p className="muted small">{coach?.error ?? "Coach unavailable."}</p>}
      {move.explainError && <p className="error-text">{move.explainError}</p>}

      {move.explanation && (
        <div className="explanation">
          <p className="verdict">{move.explanation.verdict}</p>
          <h3>Why</h3>
          <p>{move.explanation.why}</p>
          <h3>{grade.isBest ? "Why this was the right choice" : "Better was"}</h3>
          <p>{move.explanation.betterMove}</p>
          <h3>{mine ? "Opponent's idea" : "How to answer it"}</h3>
          <p>{move.explanation.reply}</p>
          <h3>Lesson</h3>
          <p>{move.explanation.lesson}</p>
          <p className="muted small">Explained by {coachModelLabel(move.explanation.model)}</p>
        </div>
      )}
    </section>
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
