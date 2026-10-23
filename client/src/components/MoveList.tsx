import { useEffect, useRef } from "react";
import { CLASSIFICATION, type PlayedMove } from "../game";

interface Props {
  moves: PlayedMove[];
  selected: number | null;
  onSelect: (index: number) => void;
}

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
      {moves.length === 0 ? (
        <p className="muted">No moves yet.</p>
      ) : (
        <div className="move-table">
          {rows.map((row) => (
            <div className="move-row" key={row.number}>
              <span className="move-no">{row.number}.</span>
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
  if (index === undefined) return <span />;
  const move = moves[index];
  const cls = move.grade?.classification;
  return (
    <button
      className={`move-cell ${selected === index ? "selected" : ""} ${move.graded ? "mine" : ""}`}
      onClick={() => onSelect(index)}
      title={cls ? CLASSIFICATION[cls].label : undefined}
      aria-label={
        cls ? `${move.san}, ${CLASSIFICATION[cls].label}` : move.gradeError ? `${move.san}, analysis failed` : move.san
      }
    >
      <span>{move.san}</span>
      {move.graded && !cls && !move.gradeError && <span className="badge pending" aria-label="Analyzing" />}
      {move.graded && move.gradeError && (
        <span className="badge error" title="Analysis failed">
          ×
        </span>
      )}
      {cls && <span className={`badge ${cls}`}>{CLASSIFICATION[cls].symbol}</span>}
    </button>
  );
}
