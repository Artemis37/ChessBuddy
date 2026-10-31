import { useEffect, useRef, type ReactNode, type Ref } from "react";
import type { Opening } from "../../../shared/openings";
import { CLASSIFICATION, type PlayedMove } from "../game";
import { GradeIcon } from "./icons";

interface Props {
  moves: PlayedMove[];
  /** Index of the move shown on the board; -1 for the starting position. */
  current: number;
  opening: Opening | null;
  white: string;
  black: string;
  /** "*" while the game is on, otherwise "1-0", "0-1" or "½-½". */
  score: string;
  onSelect: (index: number) => void;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onLast: () => void;
}

/** Laid out like chess.com's move list: opening, players, moves in two columns, navigation. */
export function MoveList({
  moves,
  current,
  opening,
  white,
  black,
  score,
  onSelect,
  onFirst,
  onPrevious,
  onNext,
  onLast,
}: Props) {
  const tableRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (tableRef.current) keepInView(tableRef.current, currentRef.current, ".move-row", current);
  }, [current, moves.length]);

  const rows: { number: number; white?: number; black?: number }[] = [];
  moves.forEach((_, i) => {
    if (i % 2 === 0) rows.push({ number: i / 2 + 1, white: i });
    else rows[rows.length - 1].black = i;
  });

  const atStart = current < 0;
  const atEnd = current >= moves.length - 1;

  return (
    <section className="card moves">
      <div className="opening" title={opening ? `${opening.eco} ${opening.name}` : undefined}>
        {opening ? opening.name : "Starting Position"}
      </div>
      <div className="game-title">
        <strong>{white}</strong> - <strong>{black}</strong> <span className="score">{score}</span>
      </div>
      <div className="move-table" role="table" aria-label="Moves" ref={tableRef}>
        {rows.map((row) => (
          <div className="move-row" role="row" key={row.number}>
            <span className="move-no" role="cell">
              {row.number}.
            </span>
            {[row.white, row.black].map((index, column) => (
              <span role="cell" key={column}>
                {index !== undefined && (
                  <MoveCell
                    move={moves[index]}
                    selected={index === current}
                    buttonRef={index === current ? currentRef : undefined}
                    onSelect={() => onSelect(index)}
                  />
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
      <nav className="move-nav" aria-label="Move navigation">
        <button onClick={onFirst} disabled={atStart} aria-label="First move" title="First move (Home)">
          <NavIcon kind="first" />
        </button>
        <button onClick={onPrevious} disabled={atStart} aria-label="Previous move" title="Previous move (←)">
          <NavIcon kind="previous" />
        </button>
        <button onClick={onNext} disabled={atEnd} aria-label="Next move" title="Next move (→)">
          <NavIcon kind="next" />
        </button>
        <button onClick={onLast} disabled={atEnd} aria-label="Last move" title="Last move (End)">
          <NavIcon kind="last" />
        </button>
      </nav>
    </section>
  );
}

/**
 * Keeps the current move in view by scrolling the list alone. scrollIntoView would also scroll
 * every container around it, the page included, and move the buttons under the mouse.
 */
function keepInView(list: HTMLElement, cell: HTMLElement | null, row: string, current: number) {
  if (!cell) {
    if (current < 0) list.scrollTop = 0;
    return;
  }
  const box = (cell.closest<HTMLElement>(row) ?? cell).getBoundingClientRect();
  const top = box.top - list.getBoundingClientRect().top + list.scrollTop;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (top + box.height > list.scrollTop + list.clientHeight) {
    list.scrollTop = top + box.height - list.clientHeight;
  }
}

interface FlowProps extends Omit<Props, "opening" | "onPrevious" | "onNext"> {
  /** More buttons beside First and Last, such as Undo. */
  tools?: ReactNode;
}

/**
 * The move list on a phone, as phone chess apps show it: the moves wrap line after line, each
 * White move after its number. Back and Forward are on the toolbar below, First and Last here.
 */
export function MoveFlow({ moves, current, white, black, score, onSelect, onFirst, onLast, tools }: FlowProps) {
  const flowRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (flowRef.current) keepInView(flowRef.current, currentRef.current, ".move-pair", current);
  }, [current, moves.length]);

  const pairs: number[][] = [];
  moves.forEach((_, i) => {
    if (i % 2 === 0) pairs.push([i]);
    else pairs[pairs.length - 1].push(i);
  });
  const atStart = current < 0;
  const atEnd = current >= moves.length - 1;

  return (
    <section className="card moves move-flow-card">
      <div className="game-title">
        <span className="flow-players">
          <strong>{white}</strong> - <strong>{black}</strong> <span className="score">{score}</span>
        </span>
        <span className="flow-tools">
          {tools}
          <button onClick={onFirst} disabled={atStart} aria-label="First move" title="First move">
            <NavIcon kind="first" />
          </button>
          <button onClick={onLast} disabled={atEnd} aria-label="Last move" title="Last move">
            <NavIcon kind="last" />
          </button>
        </span>
      </div>
      <div className="move-flow" role="list" aria-label="Moves" ref={flowRef}>
        {pairs.map((pair) => (
          // A move number stays with its moves when the line wraps.
          <span className="move-pair" role="listitem" key={pair[0]}>
            <span className="move-no">{pair[0] / 2 + 1}.</span>
            {pair.map((index) => (
              <MoveCell
                key={index}
                move={moves[index]}
                selected={index === current}
                buttonRef={index === current ? currentRef : undefined}
                onSelect={() => onSelect(index)}
              />
            ))}
          </span>
        ))}
        {moves.length === 0 && <p className="muted small">No moves yet. Play one on the board.</p>}
      </div>
    </section>
  );
}

function MoveCell({
  move,
  selected,
  buttonRef,
  onSelect,
}: {
  move: PlayedMove;
  selected: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: () => void;
}) {
  const cls = move.grade?.classification;
  const pending = !cls && !move.gradeError && (move.grading || (move.graded && !move.grade));
  // A graded book move shows both: that it's theory, and how good it is.
  const labels = [...(move.book ? ["Book move"] : []), ...(cls ? [CLASSIFICATION[cls].label] : [])];
  return (
    <button
      ref={buttonRef}
      className={`move-cell ${selected ? "selected" : ""}`}
      onClick={onSelect}
      title={labels.join(" · ") || undefined}
      aria-current={selected ? "step" : undefined}
      aria-label={[move.san, ...labels, ...(move.gradeError ? ["analysis failed"] : [])].join(", ")}
    >
      <span>{move.san}</span>
      {(move.book || cls) && (
        <span className="move-grade">
          {move.book && <GradeIcon kind="book" />}
          {cls && <GradeIcon kind={cls} />}
        </span>
      )}
      {pending && <span className="badge pending" aria-label="Analyzing" />}
      {move.gradeError && (
        <span className="badge error" title="Analysis failed">
          ×
        </span>
      )}
    </button>
  );
}

function NavIcon({ kind }: { kind: "first" | "previous" | "next" | "last" }) {
  const chevron = kind === "first" || kind === "previous" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7";
  const bar = kind === "first" ? "M6 5v14" : kind === "last" ? "M18 5v14" : null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={chevron} />
      {bar && <path d={bar} />}
    </svg>
  );
}
