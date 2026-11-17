import { useEffect, useRef, type Ref } from "react";
import type { Opening } from "../../../shared/openings";
import { CLASSIFICATION, moveRows, type PlayedMove } from "../game";
import { GradeIcon } from "./icons";

interface Props {
  moves: PlayedMove[];
  /** Index of the move shown on the board; -1 for the starting position. */
  current: number;
  opening: Opening | null;
  /** Shown instead of the opening's name when the position has none: "Starting Position" by default. */
  unnamed?: string;
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
  unnamed = "Starting Position",
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

  const rows = moveRows(moves);
  const atStart = current < 0;
  const atEnd = current >= moves.length - 1;
  const cell = (index: number) => (
    <MoveCell
      move={moves[index]}
      selected={index === current}
      buttonRef={index === current ? currentRef : undefined}
      onSelect={() => onSelect(index)}
    />
  );

  return (
    <section className="card moves">
      <div className="opening" title={opening ? `${opening.eco} ${opening.name}` : undefined}>
        {opening ? opening.name : unnamed}
      </div>
      <div className="game-title">
        <strong>{white}</strong> - <strong>{black}</strong> <span className="score">{score}</span>
      </div>
      <div className="move-table" role="table" aria-label="Moves" ref={tableRef}>
        {rows.map((row) =>
          "edit" in row ? (
            <div className="move-row edit-row" role="row" key={`edit-${row.edit}`}>
              <span role="cell">{cell(row.edit)}</span>
            </div>
          ) : (
            <div className="move-row" role="row" key={`${row.number}-${row.white ?? row.black}`}>
              <span className="move-no" role="cell">
                {row.number}.
              </span>
              {[row.white, row.black].map((index, column) => (
                <span role="cell" key={column}>
                  {index !== undefined ? cell(index) : column === 0 && <span className="move-gap">…</span>}
                </span>
              ))}
            </div>
          ),
        )}
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

type FlowProps = Omit<Props, "opening" | "unnamed" | "onPrevious" | "onNext">;

/**
 * The move list on a phone, as phone chess apps show it: the moves wrap line after line, each
 * White move after its number. Back and Forward are on the toolbar below, First and Last here.
 */
export function MoveFlow({ moves, current, white, black, score, onSelect, onFirst, onLast }: FlowProps) {
  const flowRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (flowRef.current) keepInView(flowRef.current, currentRef.current, ".move-pair", current);
  }, [current, moves.length]);

  const rows = moveRows(moves);
  const atStart = current < 0;
  const atEnd = current >= moves.length - 1;

  return (
    <section className="card moves move-flow-card">
      <div className="game-title">
        <span className="flow-players">
          <strong>{white}</strong> - <strong>{black}</strong> <span className="score">{score}</span>
        </span>
        <span className="flow-tools">
          <button onClick={onFirst} disabled={atStart} aria-label="First move" title="First move">
            <NavIcon kind="first" />
          </button>
          <button onClick={onLast} disabled={atEnd} aria-label="Last move" title="Last move">
            <NavIcon kind="last" />
          </button>
        </span>
      </div>
      <div className="move-flow" role="list" aria-label="Moves" ref={flowRef}>
        {rows.map((row) => {
          const indices = "edit" in row ? [row.edit] : [row.white, row.black].filter((i) => i !== undefined);
          return (
            // A move number stays with its moves when the line wraps.
            <span className={`move-pair ${"edit" in row ? "edit-pair" : ""}`} role="listitem" key={indices[0]}>
              {"number" in row && (
                <span className="move-no">
                  {row.number}.{row.white === undefined && ".."}
                </span>
              )}
              {indices.map((index) => (
                <MoveCell
                  key={index}
                  move={moves[index]}
                  selected={index === current}
                  buttonRef={index === current ? currentRef : undefined}
                  onSelect={() => onSelect(index)}
                />
              ))}
            </span>
          );
        })}
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
  if (move.edit) {
    return (
      <button
        ref={buttonRef}
        className={`move-cell edit-cell ${selected ? "selected" : ""}`}
        onClick={onSelect}
        aria-current={selected ? "step" : undefined}
        title="The position was edited here: step back past it to see it before"
      >
        <span>✎ Position edited</span>
      </button>
    );
  }
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
