import { useId, useState } from "react";
import { gameAccuracy, gradeCounts } from "../../../shared/accuracy";
import { readPgn } from "../../../shared/pgn";
import type { Classification, Color } from "../../../shared/types";
import {
  ChessCom,
  gameLinkId,
  outcome,
  playerColor,
  reviewGameOf,
  unsupportedReason,
  type ApiGame,
  type GamePage,
} from "../chesscom";
import { CLASSIFICATION, colorName, type PlayedMove } from "../game";
import { dateLabel, scoreOf, sideOf, timeControlLabel, toReviewGame, type ReviewGame } from "../review";

const chesscom = new ChessCom();
const CLASSES = Object.keys(CLASSIFICATION) as Classification[];
const OUTCOME_LABEL = { won: "Won", lost: "Lost", drawn: "Draw" } as const;

interface Props {
  /** The game being reviewed, or null before one is loaded. */
  game: ReviewGame | null;
  /** The moves in the move list; the game's own come first. */
  moves: PlayedMove[];
  myColor: Color;
  /** Grading stopped because a move couldn't be analyzed. */
  stopped: boolean;
  /** Loads a game, with the side the player had in it when the username tells. */
  onLoad: (game: ReviewGame, myColor: Color | null) => void;
  onResume: () => void;
}

/** Reviewing a game: pick one of your Chess.com games or paste one, then follow its grading. */
export function ReviewCard({ game, moves, myColor, stopped, onLoad, onResume }: Props) {
  const [choosing, setChoosing] = useState(false);
  // Kept while the card is open, so picking another game doesn't ask for the username again.
  const [username, setUsername] = useState("");
  const [page, setPage] = useState<GamePage | null>(null);

  if (!game || choosing) {
    return (
      <GamePicker
        username={username}
        onUsernameChange={setUsername}
        page={page}
        onPageChange={setPage}
        onLoad={(picked, color) => {
          setChoosing(false);
          onLoad(picked, color);
        }}
        onCancel={game ? () => setChoosing(false) : undefined}
      />
    );
  }
  return (
    <GameSummary
      game={game}
      moves={moves.slice(0, game.moves.length)}
      myColor={myColor}
      stopped={stopped}
      onResume={onResume}
      onChange={() => setChoosing(true)}
    />
  );
}

function GamePicker({
  username,
  onUsernameChange,
  page,
  onPageChange,
  onLoad,
  onCancel,
}: {
  username: string;
  onUsernameChange: (username: string) => void;
  page: GamePage | null;
  onPageChange: (page: GamePage) => void;
  onLoad: (game: ReviewGame, myColor: Color | null) => void;
  onCancel?: () => void;
}) {
  const [pasted, setPasted] = useState("");
  /** What's loading: "games", "older" or "pasted". */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ where: "list" | "pasted"; message: string } | null>(null);
  const userId = useId();
  const pasteId = useId();
  const listed = page && page.username.toLowerCase() === username.trim().toLowerCase() ? page : null;

  const run = async (what: string, where: "list" | "pasted", task: () => Promise<void> | void) => {
    setBusy(what);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError({ where, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const showGames = () => run("games", "list", async () => onPageChange(await chesscom.recent(username)));
  const showOlder = () =>
    run("older", "list", async () => {
      if (listed) onPageChange(await chesscom.more(listed));
    });
  const pick = (picked: ApiGame) => run("pick", "list", () => onLoad(reviewGameOf(picked), playerColor(picked, username)));

  // A link has no spaces; anything else is read as PGN.
  const loadPasted = () =>
    run("pasted", "pasted", async () => {
      const text = pasted.trim();
      const id = /\s/.test(text) ? null : gameLinkId(text);
      if (id) {
        if (!username.trim()) throw new Error("Type your Chess.com username above: the link is looked up among your games.");
        const found =
          listed?.games.find((g) => gameLinkId(g.url) === id) ?? (await chesscom.findGame(username, text));
        onLoad(reviewGameOf(found), playerColor(found, username));
        return;
      }
      if (/^https?:\/\//i.test(text)) {
        throw new Error("That isn't a Chess.com game link. Paste one like https://www.chess.com/game/live/… or the game's PGN.");
      }
      const loaded = toReviewGame(readPgn(text));
      onLoad(loaded, sideOf(loaded, username));
    });

  return (
    <section className="card review">
      <div className="openings-head">
        <h2>Review a game</h2>
        {onCancel && <button onClick={onCancel}>Cancel</button>}
      </div>

      <form
        className="review-user"
        onSubmit={(e) => {
          e.preventDefault();
          showGames();
        }}
      >
        <label className="sr-only" htmlFor={userId}>
          Chess.com username
        </label>
        <input
          id={userId}
          className="search"
          value={username}
          maxLength={25}
          autoComplete="off"
          spellCheck={false}
          placeholder="Chess.com username"
          onChange={(e) => onUsernameChange(e.target.value)}
        />
        <button type="submit" className="primary" disabled={busy !== null || !username.trim()}>
          Show games
        </button>
      </form>
      {busy === "games" && (
        <p className="muted small">
          <span className="spinner" /> Loading your games from Chess.com…
        </p>
      )}
      {error?.where === "list" && <p className="error-text small">{error.message}</p>}
      {listed && (
        <>
          {listed.games.length > 0 ? (
            <div className="pick-list">
              {listed.games.map((g) => (
                <GameChoice key={g.url} game={g} username={username} disabled={busy !== null} onPick={() => pick(g)} />
              ))}
            </div>
          ) : (
            <p className="muted small">No games on Chess.com yet.</p>
          )}
          {listed.older.length > 0 && (
            <div className="actions">
              <button onClick={showOlder} disabled={busy !== null}>
                {busy === "older" ? "Loading…" : "Older games"}
              </button>
            </div>
          )}
        </>
      )}

      <h3>
        <label htmlFor={pasteId}>Or paste a game link or PGN</label>
      </h3>
      <textarea
        id={pasteId}
        className="search paste"
        rows={3}
        value={pasted}
        spellCheck={false}
        placeholder="https://www.chess.com/game/live/… or the PGN from Share → PGN"
        onChange={(e) => setPasted(e.target.value)}
      />
      <div className="actions">
        <button className="primary" onClick={loadPasted} disabled={busy !== null || !pasted.trim()}>
          {busy === "pasted" ? "Loading…" : "Load game"}
        </button>
      </div>
      {error?.where === "pasted" && <p className="error-text small">{error.message}</p>}
    </section>
  );
}

function GameChoice({
  game,
  username,
  disabled,
  onPick,
}: {
  game: ApiGame;
  username: string;
  disabled: boolean;
  onPick: () => void;
}) {
  const color = playerColor(game, username) ?? "w";
  const opponent = color === "w" ? game.black : game.white;
  const result = outcome(game, color);
  const reason = unsupportedReason(game);
  const when = game.end_time ? new Date(game.end_time * 1000) : null;
  const sameYear = when?.getFullYear() === new Date().getFullYear();
  const details = [
    colorName(color),
    [game.time_class && capitalize(game.time_class), timeControlLabel(game.time_control)].filter(Boolean).join(" "),
    when?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" }),
    reason,
  ].filter(Boolean);
  return (
    <button className="pick" onClick={onPick} disabled={disabled || Boolean(reason)} title={reason ?? undefined}>
      <span className="pick-name">
        vs {opponent.username}
        {opponent.rating ? ` (${opponent.rating})` : ""}
      </span>
      <span className={`pick-meta outcome ${result}`}>{OUTCOME_LABEL[result]}</span>
      <span className="pick-moves">{details.join(" · ")}</span>
    </button>
  );
}

function GameSummary({
  game,
  moves,
  myColor,
  stopped,
  onResume,
  onChange,
}: {
  game: ReviewGame;
  /** The game's own moves. */
  moves: PlayedMove[];
  myColor: Color;
  stopped: boolean;
  onResume: () => void;
  onChange: () => void;
}) {
  const grades = moves.flatMap((m) => (m.grade ? [m.grade] : []));
  const done = grades.length === moves.length;
  const counts = gradeCounts(grades);
  const accuracy = done ? gameAccuracy(grades) : null;
  const failure = moves.find((m) => m.gradeError)?.gradeError;
  const details = [
    game.timeClass && capitalize(game.timeClass),
    timeControlLabel(game.timeControl),
    dateLabel(game.date),
  ].filter(Boolean);
  const players: { color: Color; name: string; rating?: number }[] = [
    { color: "w", ...game.white },
    { color: "b", ...game.black },
  ];
  const chesscomAccuracy = game.accuracies && { w: game.accuracies.white, b: game.accuracies.black };

  return (
    <section className="card review">
      <div className="openings-head">
        <div>
          <h2>
            {game.white.name} vs {game.black.name}
          </h2>
          <p className="owner">
            {details.join(" · ")}
            {game.url && (
              <>
                {details.length > 0 && " · "}
                <a href={game.url} target="_blank" rel="noreferrer">
                  {game.url.includes("chess.com/") ? "Open on Chess.com" : "Open the game"}
                </a>
              </>
            )}
          </p>
        </div>
        <button onClick={onChange}>Another game</button>
      </div>
      <p className="study-status">
        <strong>{scoreOf(game.result)}</strong>
        {game.termination && ` · ${game.termination}`}
      </p>

      {!done &&
        (stopped ? (
          <>
            <p className="error-text small">Grading stopped: {failure ?? "a move couldn't be analyzed."}</p>
            <div className="actions">
              <button className="primary" onClick={onResume}>
                Resume grading
              </button>
            </div>
          </>
        ) : (
          <>
            <div
              className="progress"
              role="progressbar"
              aria-label="Moves graded"
              aria-valuemin={0}
              aria-valuemax={moves.length}
              aria-valuenow={grades.length}
            >
              <div style={{ width: `${(grades.length / moves.length) * 100}%` }} />
            </div>
            <p className="muted small">
              <span className="spinner" /> Grading moves with Stockfish: {grades.length} of {moves.length}. It pauses while
              this tab is in the background.
            </p>
          </>
        ))}

      <table className="review-table">
        <thead>
          <tr>
            <th />
            {players.map((p) => (
              <th key={p.color} scope="col">
                <span className="review-player">{p.name}</span>
                <span className="muted">
                  {p.rating ? `${p.rating}` : colorName(p.color)}
                  {p.color === myColor ? " · you" : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="accuracy">
            <th scope="row">Accuracy</th>
            {players.map((p) => (
              <td key={p.color}>{accuracy?.[p.color] != null ? accuracy[p.color]!.toFixed(1) : "…"}</td>
            ))}
          </tr>
          {chesscomAccuracy && (
            <tr className="chesscom-accuracy">
              <th scope="row">Chess.com's figure</th>
              {players.map((p) => (
                <td key={p.color}>{chesscomAccuracy[p.color].toFixed(1)}</td>
              ))}
            </tr>
          )}
          {CLASSES.map((c) => (
            <tr key={c}>
              <th scope="row">
                <span className={`badge ${c}`}>{CLASSIFICATION[c].symbol}</span> {CLASSIFICATION[c].label}
              </th>
              {players.map((p) => (
                <td key={p.color}>{counts[p.color][c]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Accuracy uses Lichess's published formula. Chess.com's own formula is private, so its figure differs a little.
      </p>
    </section>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
