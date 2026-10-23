import { numberedLine } from "../../../shared/notation";
import type { Color, StatusResponse } from "../../../shared/types";
import { CLASSIFICATION, colorName, moveNumber, type PlayedMove } from "../game";

interface Props {
  move?: PlayedMove;
  index: number | null;
  myColor: Color;
  onBoard: boolean;
  coach: StatusResponse["coach"] | null;
  onExplain: (index: number) => void;
  onRetry: (index: number) => void;
  onRegrade: (index: number) => void;
  onShowOnBoard: (index: number) => void;
}

export function MovePanel({ move, index, myColor, onBoard, coach, onExplain, onRetry, onRegrade, onShowOnBoard }: Props) {
  if (!move || index === null) {
    return (
      <section className="card panel">
        <h2>Move review</h2>
        <p className="muted">Every {colorName(myColor)} move you play gets graded here. Click any move in the list to review it.</p>
      </section>
    );
  }

  const title = `${moveNumber(index)} ${move.san}`;

  if (!move.graded) {
    return (
      <section className="card panel">
        <h2>{title}</h2>
        <p className="muted">This is a {colorName(move.color)} move. Only your {colorName(myColor)} moves are graded.</p>
      </section>
    );
  }

  if (move.gradeError) {
    return (
      <section className="card panel">
        <h2>{title}</h2>
        <p className="error-text">Couldn't analyze this move: {move.gradeError}</p>
        <button onClick={() => onRegrade(index)}>Try again</button>
      </section>
    );
  }

  const grade = move.grade;
  if (!grade) {
    return (
      <section className="card panel">
        <h2>{title}</h2>
        <p className="muted">
          <span className="spinner" /> Analyzing with Stockfish…
        </p>
      </section>
    );
  }

  const info = CLASSIFICATION[grade.classification];
  const best = grade.bestMoves[0];
  const weak = ["inaccuracy", "mistake", "blunder"].includes(grade.classification);

  return (
    <section className="card panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <span className={`tag ${grade.classification}`}>
          {info.symbol} {info.label}
        </span>
      </div>

      <dl className="facts">
        <dt>Evaluation</dt>
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
            <dt>Opponent's best reply</dt>
            <dd className="line">{numberedLine(grade.fenAfter, grade.opponentReply)}</dd>
          </>
        )}
      </dl>

      {grade.motifs.length > 0 && (
        <ul className="motifs">
          {grade.motifs.map((m) => (
            <li key={m}>{m}</li>
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
        {!onBoard && <button onClick={() => onShowOnBoard(index)}>Show on board</button>}
        {weak && <button onClick={() => onRetry(index)}>Retry this move</button>}
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
          <h3>Opponent's idea</h3>
          <p>{move.explanation.opponentIdea}</p>
          <h3>Lesson</h3>
          <p>{move.explanation.lesson}</p>
        </div>
      )}
    </section>
  );
}
