import { useEffect, useRef } from "react";
import { pieceUrl } from "../board/Board";
import { CLASSIFICATION, type PlayedMove } from "../game";

interface Props {
  moves: PlayedMove[];
  selected: number | null;
  onSelect: (index: number) => void;
}

/** Moves in two columns, White's and Black's, one row per move number (as on chess.com). */
export function MoveList({ moves, selected, onSelect }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [moves.length]);

  const rows: { number: number; white?: number; black?: number }[] = [];
  moves.forEach((_, i) => {
    if (i % 2 === 0) rows.push({ number: i / 2 + 1, white: i });
    else rows[rows.length - 1].black = i;
  });

  return (
    <section className="card moves">
      <h2>Moves</h2>
      <div className="move-head" aria-hidden>
        <span />
        <span>
          <img src={pieceUrl("w", "p")} alt="" /> White
        </span>
        <span>
          <img src={pieceUrl("b", "p")} alt="" /> Black
        </span>
      </div>
      {moves.length === 0 ? (
        <p className="muted">No moves yet.</p>
      ) : (
        <div className="move-table" role="table" aria-label="Moves">
          {rows.map((row) => (
            <div className="move-row" role="row" key={row.number}>
              <span className="move-no" role="cell">
                {row.number}.
              </span>
              <MoveCell moves={moves} index={row.white} selected={selected} onSelect={onSelect} />
              <MoveCell moves={moves} index={row.black} selected={selected} onSelect={onSelect} />
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </section>
  );
}

function MoveCell({
  moves,
  index,
  selected,
  onSelect,
}: {
  moves: PlayedMove[];
  index?: number;
  selected: number | null;
  onSelect: (index: number) => void;
}) {
  if (index === undefined) return <span role="cell" />;
  const move = moves[index];
  const cls = move.grade?.classification;
  const pending = !cls && !move.gradeError && (move.grading || (move.graded && !move.grade));
  return (
    <span role="cell">
      <button
        className={`move-cell ${selected === index ? "selected" : ""} ${move.graded ? "mine" : ""}`}
        onClick={() => onSelect(index)}
        title={cls ? CLASSIFICATION[cls].label : undefined}
        aria-label={
          cls ? `${move.san}, ${CLASSIFICATION[cls].label}` : move.gradeError ? `${move.san}, analysis failed` : move.san
        }
      >
        <span>{move.san}</span>
        {pending && <span className="badge pending" aria-label="Analyzing" />}
        {move.gradeError && (
          <span className="badge error" title="Analysis failed">
            ×
          </span>
        )}
        {cls && <span className={`badge ${cls}`}>{CLASSIFICATION[cls].symbol}</span>}
      </button>
    </span>
  );
}
