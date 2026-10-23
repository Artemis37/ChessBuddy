import { Chess } from "chess.js";
import { useMemo, useState } from "react";
import { numberedLine } from "../../../shared/notation";
import {
  divergence,
  familyName,
  nameMatches,
  openingFamilies,
  positionKey,
  variationName,
  type OpeningBook,
  type OpeningFamily,
  type OpeningLine,
} from "../../../shared/openings";
import { moveNumber, type PlayedMove } from "../game";

const START_FEN = new Chess().fen();
/** Lines listed for a search across every opening; a longer query narrows it down. */
const MAX_RESULTS = 40;

interface Props {
  /** Every named line; null while they load, empty if they couldn't be loaded. */
  lines: OpeningLine[] | null;
  /** Book moves in SAN from each position. */
  next: Record<string, string[]>;
  book: OpeningBook | null;
  /** The line being learned, or null before one is picked. */
  study: OpeningLine | null;
  moves: PlayedMove[];
  /** Number of moves shown on the board. */
  shown: number;
  /** Position shown on the board. */
  fen: string;
  onPick: (line: OpeningLine) => void;
  onPlay: (uci: string) => void;
  /** The book move under the pointer, drawn on the board; null when the pointer leaves. */
  onHover: (uci: string | null) => void;
  onBackToLine: () => void;
}

/** Learning openings: pick a line, then follow it, see the book moves and find your way back. */
export function OpeningsCard(props: Props) {
  const { lines, study, onPick } = props;
  const [choosing, setChoosing] = useState(false);

  if (!lines || lines.length === 0) {
    return (
      <section className="card openings">
        <h2>Learn an opening</h2>
        {lines ? (
          <p className="error-text">Couldn't load the opening list. Run "npm run openings:build" and reload.</p>
        ) : (
          <p className="muted">
            <span className="spinner" /> Loading openings…
          </p>
        )}
      </section>
    );
  }
  if (!study || choosing) {
    return (
      <OpeningPicker
        lines={lines}
        onPick={(line) => {
          setChoosing(false);
          onPick(line);
        }}
        onCancel={study ? () => setChoosing(false) : undefined}
      />
    );
  }
  return <StudyView {...props} study={study} onChange={() => setChoosing(true)} />;
}

function OpeningPicker({
  lines,
  onPick,
  onCancel,
}: {
  lines: OpeningLine[];
  onPick: (line: OpeningLine) => void;
  onCancel?: () => void;
}) {
  const families = useMemo(() => openingFamilies(lines), [lines]);
  const [family, setFamily] = useState<OpeningFamily | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim();

  const open = (chosen: OpeningFamily | null) => {
    setFamily(chosen);
    setQuery("");
  };

  let list;
  if (family) {
    const found = family.lines.filter((line) => nameMatches(line.name, q));
    // Lines are sorted with the opening's own, shortest line first; later lines may share its name.
    const label = (line: OpeningLine) => variationName(line.name) || (line === family.lines[0] ? "Main line" : line.name);
    list = found.map((line, i) => <LineChoice key={i} line={line} label={label(line)} onPick={onPick} />);
    if (found.length === 0) list = <p className="muted small">No line of the {family.name} matches "{q}".</p>;
  } else if (!q) {
    list = families.map((f) => <FamilyChoice key={f.name} family={f} onOpen={() => open(f)} />);
  } else {
    const foundFamilies = families.filter((f) => nameMatches(f.name, q));
    const foundLines = lines.filter((line) => nameMatches(line.name, q));
    list = (
      <>
        {foundFamilies.map((f) => (
          <FamilyChoice key={f.name} family={f} onOpen={() => open(f)} />
        ))}
        {foundLines.slice(0, MAX_RESULTS).map((line, i) => (
          <LineChoice key={i} line={line} label={line.name} onPick={onPick} />
        ))}
        {foundLines.length > MAX_RESULTS && (
          <p className="muted small">
            {foundLines.length - MAX_RESULTS} more lines match. Add a word to narrow the search.
          </p>
        )}
        {foundFamilies.length === 0 && foundLines.length === 0 && (
          <p className="muted small">No opening matches "{q}".</p>
        )}
      </>
    );
  }

  return (
    <section className="card openings">
      <div className="openings-head">
        {family ? (
          <button className="back" onClick={() => open(null)}>
            ‹ All openings
          </button>
        ) : (
          <h2>Learn an opening</h2>
        )}
        {onCancel && <button onClick={onCancel}>Cancel</button>}
      </div>
      {family && (
        <h2>
          {family.name} <span className="count">{family.lines.length} lines</span>
        </h2>
      )}
      <input
        className="search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={family ? `Filter the ${family.name}, e.g. a variation` : "Search, e.g. Sicilian Najdorf"}
        aria-label={family ? `Filter the lines of the ${family.name}` : "Search openings"}
      />
      <div className="pick-list">{list}</div>
    </section>
  );
}

function FamilyChoice({ family, onOpen }: { family: OpeningFamily; onOpen: () => void }) {
  return (
    <button className="pick" onClick={onOpen}>
      <span className="pick-name">{family.name}</span>
      <span className="pick-meta">{family.lines.length === 1 ? "1 line" : `${family.lines.length} lines`}</span>
      <span className="pick-moves">{numberedLine(START_FEN, family.lines[0].moves)}</span>
    </button>
  );
}

function LineChoice({ line, label, onPick }: { line: OpeningLine; label: string; onPick: (line: OpeningLine) => void }) {
  return (
    <button className="pick" onClick={() => onPick(line)} title={line.name}>
      <span className="pick-name">{label}</span>
      <span className="pick-meta">{line.eco}</span>
      <span className="pick-moves">{numberedLine(START_FEN, line.moves)}</span>
    </button>
  );
}

interface BookChoice {
  san: string;
  uci: string;
  /** The move with its number, such as "2... Nc6". */
  label: string;
  /** The opening the move leads to, if that position has a name. */
  name: string | null;
}

function bookChoices(fen: string, moves: string[], book: OpeningBook | null): BookChoice[] {
  return moves.flatMap((san) => {
    const board = new Chess(fen);
    try {
      const made = board.move(san);
      const entry = book?.[positionKey(board.fen())];
      return [{ san: made.san, uci: made.lan, label: numberedLine(fen, [made.san]), name: entry ? entry[1] : null }];
    } catch {
      return [];
    }
  });
}

function StudyView({
  study,
  next,
  book,
  moves,
  shown,
  fen,
  onPlay,
  onHover,
  onBackToLine,
  onChange,
}: Props & { study: OpeningLine; onChange: () => void }) {
  const leftAt = divergence(
    study.moves,
    moves.map((m) => m.san),
  );
  const onLine = leftAt === null || shown <= leftAt;
  const lineNext = onLine && shown < study.moves.length ? study.moves[shown] : null;
  const choices = useMemo(() => bookChoices(fen, next[positionKey(fen)] ?? [], book), [fen, next, book]);
  const family = familyName(study.name);
  // Within the opening being learned, its name goes without saying.
  const shortName = (name: string) => (familyName(name) === family ? variationName(name) || name : name);

  let status;
  if (leftAt !== null) {
    status = (
      <>
        You left the line with{" "}
        <strong>
          {moveNumber(leftAt)} {moves[leftAt].san}
        </strong>
        ; it goes{" "}
        <strong>
          {moveNumber(leftAt)} {study.moves[leftAt]}
        </strong>
        .
      </>
    );
  } else if (shown < study.moves.length) {
    status = (
      <>
        Move {shown} of {study.moves.length}. Next in the line:{" "}
        <strong>
          {moveNumber(shown)} {study.moves[shown]}
        </strong>{" "}
        (press → or pick it below).
      </>
    );
  } else if (shown === study.moves.length) {
    status = <>End of the line. Play on to explore, or try a book move.</>;
  } else {
    status = <>Past the end of the line: you're exploring on your own.</>;
  }

  return (
    <section className="card openings">
      <div className="openings-head">
        <div>
          <h2>{study.name}</h2>
          <p className="owner">
            {study.eco} · {numberedLine(START_FEN, study.moves)}
          </p>
        </div>
        <button onClick={onChange}>Change</button>
      </div>
      <p className="study-status">{status}</p>
      {leftAt !== null && (
        <div className="actions">
          <button className="primary" onClick={onBackToLine}>
            Back to the line
          </button>
        </div>
      )}

      <h3>Book moves here</h3>
      {choices.length > 0 ? (
        <ul className="book-moves" onMouseLeave={() => onHover(null)}>
          {choices.map((choice) => (
            <li key={choice.uci}>
              <button
                className={`book-move ${choice.san === lineNext ? "in-line" : ""}`}
                onClick={() => onPlay(choice.uci)}
                onMouseEnter={() => onHover(choice.uci)}
                onFocus={() => onHover(choice.uci)}
                onBlur={() => onHover(null)}
              >
                <span className="book-san">{choice.label}</span>
                <span className="book-name">{choice.name ? shortName(choice.name) : ""}</span>
                {choice.san === lineNext && <span className="line-tag">line</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">
          No book moves here: the opening book ends. Keep exploring; moves off the book are graded and the
          evaluation bar shows how the position stands.
        </p>
      )}
    </section>
  );
}
