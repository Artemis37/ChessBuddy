import { Chess } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  byShare,
  EXPLORER_SPEEDS,
  formatGames,
  formatShare,
  gameCount,
  moveShare,
  RATING_BANDS,
  resultShares,
  type ExplorerStats,
  type Results,
} from "../../../shared/explorer";
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
import { loadBand, saveBand, useExplorerStats } from "../explorer";
import { moveNumber, type PlayedMove } from "../game";
import { scrollPanelToTop } from "./PhoneLayout";

const START_FEN = new Chess().fen();
/** Lines listed for a search across every opening; a longer query narrows it down. */
const MAX_RESULTS = 40;
/** Moves off the book are listed once at least this percentage of the band's games go on with them. */
const ALSO_PLAYED = 2;
/** Below this many games in the band, the percentages are greyed out: too few to go by. */
const FEW_GAMES = 100;
const SPEEDS_LABEL = EXPLORER_SPEEDS.join(" and ");

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
  /** Whether the server can ask the Lichess opening explorer how often each move is played; null until known. */
  explorer: { ready: boolean; error?: string } | null;
  /**
   * The phone layout's explorer: each book move's row also shows how its games ended, as phone
   * chess apps' explorers do, and the lists scroll with the panel rather than on their own.
   */
  compact?: boolean;
}

/** Learning openings: pick a line, then follow it, see the book moves and find your way back. */
export function OpeningsCard(props: Props) {
  const { lines, study, onPick, compact } = props;
  const [choosing, setChoosing] = useState(false);

  if (!lines || lines.length === 0) {
    return (
      <section className={compact ? "card openings compact" : "card openings"}>
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
        compact={compact}
      />
    );
  }
  return <StudyView {...props} study={study} onChange={() => setChoosing(true)} />;
}

function OpeningPicker({
  lines,
  onPick,
  onCancel,
  compact,
}: {
  lines: OpeningLine[];
  onPick: (line: OpeningLine) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const families = useMemo(() => openingFamilies(lines), [lines]);
  const [family, setFamily] = useState<OpeningFamily | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim();
  const ref = useRef<HTMLElement>(null);

  // On a phone the panel scrolls rather than the list, so a family's lines show from the top.
  useEffect(() => {
    if (compact) scrollPanelToTop(ref.current);
  }, [family, compact]);

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
    <section className={compact ? "card openings compact" : "card openings"} ref={ref}>
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

/** Moves off the book that at least ALSO_PLAYED percent of the band's games went on with, most played first. */
function alsoPlayed(fen: string, stats: ExplorerStats, inBook: BookChoice[]): BookChoice[] {
  const sans = new Set(inBook.map((choice) => choice.san));
  const popular = stats.moves.filter((m) => !sans.has(m.san) && moveShare(stats, m.san) >= ALSO_PLAYED);
  return bookChoices(
    fen,
    popular.map((m) => m.san),
    null,
  );
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
  explorer,
  compact,
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

  const statsReady = explorer?.ready ?? false;
  const [band, setBand] = useState(loadBand);
  /** The move under the pointer or the keyboard focus, shown in the chart. */
  const [focus, setFocus] = useState<string | null>(null);
  const explored = useExplorerStats(fen, band, statsReady);
  const bandIndex = RATING_BANDS.findIndex((b) => b.rating === band);
  const here = explored.stats[bandIndex];
  const few = here !== undefined && gameCount(here) < FEW_GAMES;
  // The most played first, once the band's numbers are in; until then, the book's order.
  const ordered = here ? byShare(choices, (choice) => moveShare(here, choice.san)) : choices;
  const offBook = here ? alsoPlayed(fen, here, choices) : [];
  const listed = [...ordered, ...offBook];
  const focused =
    listed.find((choice) => choice.san === focus) ?? ordered.find((choice) => choice.san === lineNext) ?? listed[0];

  const point = (choice: BookChoice | null) => {
    onHover(choice?.uci ?? null);
    setFocus(choice?.san ?? null);
  };
  const pickBand = (rating: number) => {
    setBand(rating);
    saveBand(rating);
    // The rows move to the new band's order, so the pointer may no longer be on the move it showed.
    point(null);
  };

  const row = (choice: BookChoice, inBook: boolean) => {
    const share = here ? moveShare(here, choice.san) : 0;
    const inLine = choice.san === lineNext;
    let shareText;
    if (here) shareText = formatShare(share);
    else if (explored.error) shareText = "–";
    else shareText = <span className="share-placeholder" />;
    return (
      <li key={choice.uci}>
        <button
          className={`book-move ${inLine ? "in-line" : ""} ${inBook ? "" : "off-book"}`}
          onClick={() => onPlay(choice.uci)}
          onMouseEnter={() => point(choice)}
          onFocus={() => point(choice)}
          onBlur={() => onHover(null)}
        >
          {statsReady && !compact && <span className="share-bar" style={{ width: `${Math.min(100, share)}%` }} />}
          <span className="book-san">{choice.label}</span>
          <span className="book-name">{inBook ? (choice.name ? shortName(choice.name) : "") : "Not in the book"}</span>
          {inLine && <span className="line-tag">line</span>}
          {statsReady && (
            <span
              className={`book-share ${few ? "few" : ""}`}
              title={here ? `${formatGames(gameCount(here))} games at this level${few ? ": too few to go by" : ""}` : undefined}
            >
              {shareText}
            </span>
          )}
          {statsReady && compact && <ResultsBar move={here?.moves.find((m) => m.san === choice.san)} />}
        </button>
      </li>
    );
  };

  let caption = null;
  if (statsReady) {
    const games = here ? (gameCount(here) === 0 ? "no games" : `${formatGames(gameCount(here))} games`) : "loading…";
    caption = explored.error ? (
      <p className="band-caption error-text" title={explored.error}>
        {explored.error}
      </p>
    ) : explored.slow ? (
      <p className="band-caption">Waiting: Lichess allows 20 requests a minute…</p>
    ) : (
      <p className="band-caption">
        Lichess {RATING_BANDS[bandIndex].lichess} · {SPEEDS_LABEL} · {games}
      </p>
    );
  }

  const lineText = (
    <p className="owner">
      {study.eco} · {numberedLine(START_FEN, study.moves)}
    </p>
  );

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
  } else if (compact && shown < study.moves.length) {
    // One line on a phone, so the book moves show without scrolling.
    status = (
      <>
        Move {shown} of {study.moves.length} · next{" "}
        <strong>
          {moveNumber(shown)} {study.moves[shown]}
        </strong>
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
    <section className={compact ? "card openings compact" : "card openings"}>
      <div className="openings-head">
        <div>
          <h2>{study.name}</h2>
          {!compact && lineText}
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

      <div className="book-head">
        <h3>{compact ? "Book moves" : "Book moves here"}</h3>
        {statsReady && (
          <select
            className="band-select"
            value={band}
            onChange={(e) => pickBand(Number(e.target.value))}
            aria-label="Players' rating"
            title="Players' approximate Chess.com rating"
          >
            {RATING_BANDS.map((b) => (
              <option key={b.rating} value={b.rating}>
                Players ≈ {b.chessCom}
              </option>
            ))}
          </select>
        )}
      </div>
      {caption}
      {choices.length === 0 && (
        <p className="muted small">
          No book moves here: the opening book ends. Keep exploring; moves off the book are graded and the
          evaluation bar shows how the position stands.
        </p>
      )}
      {listed.length > 0 && (
        <ul className="book-moves" onMouseLeave={() => point(null)}>
          {ordered.map((choice) => row(choice, true))}
          {offBook.length > 0 && <li className="book-sep">Also played here</li>}
          {offBook.map((choice) => row(choice, false))}
        </ul>
      )}
      {statsReady && focused && (
        <BandChart
          choice={focused}
          name={offBook.includes(focused) ? "not in the book" : focused.name ? shortName(focused.name) : ""}
          stats={explored.stats}
          band={band}
        />
      )}
      {explorer && !explorer.ready && explorer.error && <p className="muted small">{explorer.error}</p>}
      {/* On a phone the book moves come first; the line's moves are also in the Moves panel. */}
      {compact && lineText}
    </section>
  );
}

/** How often one move is played across the rating bands, and how its games ended in the chosen band. */
function BandChart({
  choice,
  name,
  stats,
  band,
}: {
  choice: BookChoice;
  name: string;
  /** Each band's statistics, in RATING_BANDS order; undefined while one loads. */
  stats: (ExplorerStats | undefined)[];
  band: number;
}) {
  const shares = stats.map((s) => (s ? moveShare(s, choice.san) : null));
  const top = Math.max(0, ...shares.map((s) => s ?? 0));
  const chosen = RATING_BANDS.findIndex((b) => b.rating === band);
  const here = stats[chosen];
  const move = here?.moves.find((m) => m.san === choice.san);
  const games = move ? gameCount(move) : 0;
  const split = move ? resultShares(move) : null;
  const level = `≈ ${RATING_BANDS[chosen].chessCom}`;

  let results = " ";
  if (here && games === 0) results = `Not played at ${level}`;
  else if (split) {
    results = `White ${Math.round(split.white)}% · draw ${Math.round(split.draws)}% · Black ${Math.round(
      split.black,
    )}% · ${formatGames(games)} games at ${level}`;
  }

  return (
    <div className="band-chart">
      <div className="band-chart-head">
        <span>
          <strong>{choice.label}</strong> {name}
        </span>
        <span className="muted">across ratings</span>
      </div>
      <div className="band-cols">
        {RATING_BANDS.map((b, i) => {
          const share = shares[i];
          return (
            <span
              key={b.rating}
              className={`band-col ${b.rating === band ? "chosen" : ""} ${share === null ? "pending" : ""}`}
              style={share === null ? undefined : { height: `${top > 0 ? Math.max(5, (share / top) * 100) : 5}%` }}
              title={`≈ ${b.chessCom}: ${share === null ? "loading…" : formatShare(share)}`}
            />
          );
        })}
      </div>
      <div className="band-axis">
        {RATING_BANDS.map((b) => (
          <span key={b.rating}>{b.short}</span>
        ))}
      </div>
      <div className="results" title="White wins, draws, Black wins">
        {split && games > 0 && (
          <>
            <span className="results-white" style={{ width: `${split.white}%` }} />
            <span className="results-draw" style={{ width: `${split.draws}%` }} />
            <span className="results-black" style={{ width: `${split.black}%` }} />
          </>
        )}
      </div>
      <p className="results-text">{results}</p>
    </div>
  );
}

/** Wide enough a share of the bar to print its percentage in. */
const LABELLED_SHARE = 22;

/**
 * How a book move's games ended in the chosen band, White's wins, draws and Black's wins, on its
 * row in the phone layout. Grey while the band loads, or for a move its players didn't play.
 */
function ResultsBar({ move }: { move: Results | undefined }) {
  const split = move && gameCount(move) > 0 ? resultShares(move) : null;
  if (!split) return <span className="row-results" />;
  const part = (kind: "white" | "draw" | "black", share: number) => (
    <span className={`results-${kind}`} style={{ width: `${share}%` }}>
      {share >= LABELLED_SHARE && `${Math.round(share)}%`}
    </span>
  );
  return (
    <span
      className="row-results"
      title={`White ${Math.round(split.white)}% · draw ${Math.round(split.draws)}% · Black ${Math.round(split.black)}%`}
    >
      {part("white", split.white)}
      {part("draw", split.draws)}
      {part("black", split.black)}
    </span>
  );
}
