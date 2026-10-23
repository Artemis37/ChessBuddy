import { Chess, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { StatusResponse } from "../../shared/types";
import { api } from "./api";
import { MoveList } from "./components/MoveList";
import { MovePanel } from "./components/MovePanel";
import { SetupCard } from "./components/SetupCard";
import { colorName, moveNumber, type PlayedMove, type Settings } from "./game";

type Arrow = [Square, Square, string?];

const PLAYED_ARROW = "rgba(232, 150, 30, 0.85)";
const BEST_ARROW = "rgba(30, 160, 90, 0.85)";
const HIGHLIGHT: CSSProperties = { background: "rgba(255, 210, 0, 0.38)" };
const BOT_MIN_THINK_MS = 400;

function toMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

function resultText(game: Chess): string | null {
  if (game.isCheckmate()) return `Checkmate. ${colorName(game.turn() === "w" ? "b" : "w")} wins.`;
  if (game.isStalemate()) return "Draw by stalemate.";
  if (game.isThreefoldRepetition()) return "Draw by threefold repetition.";
  if (game.isInsufficientMaterial()) return "Draw by insufficient material.";
  if (game.isDraw()) return "Draw by the 50-move rule.";
  return null;
}

function lastGradedIndex(moves: PlayedMove[]): number | null {
  for (let i = moves.length - 1; i >= 0; i--) if (moves[i].graded) return i;
  return null;
}

export function App() {
  const [draft, setDraft] = useState<Settings>({ mode: "bot", myColor: "w", rating: 1000 });
  const [settings, setSettings] = useState<Settings>(draft);
  const [moves, setMoves] = useState<PlayedMove[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const nextId = useRef(1);
  /** Bumped whenever the move list is rewritten, so late bot replies are dropped. */
  const gameToken = useRef(0);

  const game = useMemo(() => {
    const g = new Chess();
    for (const m of moves) g.move(toMove(m.uci));
    return g;
  }, [moves]);
  const fen = game.fen();
  const turn = game.turn();
  const result = resultText(game);
  const humanTurn = settings.mode === "both" || turn === settings.myColor;

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.status().then(
        (s) => alive && setStatus(s),
        () => alive && setStatus(null),
      );
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const updateMove = useCallback((id: number, patch: Partial<PlayedMove>) => {
    setMoves((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const grade = useCallback(
    (move: PlayedMove) => {
      updateMove(move.id, { gradeError: undefined });
      api.grade(move.fenBefore, move.uci).then(
        (g) => updateMove(move.id, { grade: g }),
        (err: Error) => updateMove(move.id, { gradeError: err.message }),
      );
    },
    [updateMove],
  );

  const play = useCallback(
    (uci: string): boolean => {
      const board = new Chess(fen);
      let made;
      try {
        made = board.move(toMove(uci));
      } catch {
        return false;
      }
      const move: PlayedMove = {
        id: nextId.current++,
        san: made.san,
        uci: made.lan,
        color: made.color,
        fenBefore: fen,
        fenAfter: board.fen(),
        graded: made.color === settings.myColor,
      };
      setMoves((list) => [...list, move]);
      setSelected(null);
      if (move.graded) grade(move);
      return true;
    },
    [fen, settings.myColor, grade],
  );

  // The bot replies whenever it is its turn.
  useEffect(() => {
    if (settings.mode !== "bot" || result || turn === settings.myColor || botError) return;
    const token = gameToken.current;
    let cancelled = false;
    const started = Date.now();
    setBotThinking(true);
    api
      .botMove(fen, settings.rating)
      .then(async ({ uci }) => {
        const wait = BOT_MIN_THINK_MS - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (!cancelled && token === gameToken.current) play(uci);
      })
      .catch((err: Error) => !cancelled && setBotError(err.message))
      .finally(() => !cancelled && setBotThinking(false));
    return () => {
      cancelled = true;
      setBotThinking(false);
    };
  }, [fen, turn, result, settings, botError, play]);

  const newGame = () => {
    gameToken.current++;
    setSettings(draft);
    setMoves([]);
    setSelected(null);
    setBotError(null);
  };

  const retry = (index: number) => {
    gameToken.current++;
    setMoves((list) => list.slice(0, index));
    setSelected(null);
    setBotError(null);
  };

  const explain = (index: number) => {
    const move = moves[index];
    if (!move?.grade) return;
    updateMove(move.id, { explaining: true, explainError: undefined });
    api.explain(move.grade, moves.slice(0, index).map((m) => m.san)).then(
      (explanation) => updateMove(move.id, { explanation, explaining: false }),
      (err: Error) => updateMove(move.id, { explaining: false, explainError: err.message }),
    );
  };

  const reviewing = selected !== null && moves[selected] !== undefined;
  const shown = reviewing ? moves[selected] : null;
  const panelIndex = reviewing ? selected : lastGradedIndex(moves);

  const arrows: Arrow[] = [];
  const squareStyles: Record<string, CSSProperties> = {};
  if (shown) {
    const played = toMove(shown.uci);
    arrows.push([played.from as Square, played.to as Square, PLAYED_ARROW]);
    const best = shown.grade?.bestMoves[0];
    if (best && best.uci !== shown.uci) {
      arrows.push([best.uci.slice(0, 2) as Square, best.uci.slice(2, 4) as Square, BEST_ARROW]);
    }
    squareStyles[played.from] = HIGHLIGHT;
  } else if (moves.length > 0) {
    const last = toMove(moves[moves.length - 1].uci);
    squareStyles[last.from] = HIGHLIGHT;
    squareStyles[last.to] = HIGHLIGHT;
  }

  const canDrag = !reviewing && !result && humanTurn && !botThinking;
  const botLabel = settings.rating === "max" ? "Maximum" : `${settings.rating} rating`;
  const opponentColor = settings.myColor === "w" ? "b" : "w";
  const opponentLabel =
    settings.mode === "bot"
      ? `Stockfish · ${botLabel} (${colorName(opponentColor)})`
      : `${colorName(opponentColor)} · you move it, not graded`;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <span aria-hidden>♞</span> ChessBuddy
        </h1>
        <StatusPills status={status} />
      </header>

      <main className="layout">
        <section className="board-col">
          <div className="player-strip">
            <span className={`dot ${opponentColor}`} />
            {opponentLabel}
            {botThinking && <span className="thinking">thinking…</span>}
          </div>

          <div className="board-wrap">
            <Chessboard
              id="main"
              position={shown ? shown.fenBefore : fen}
              boardOrientation={settings.myColor === "w" ? "white" : "black"}
              arePiecesDraggable={canDrag}
              isDraggablePiece={({ piece }) => piece[0] === turn}
              onPieceDrop={(from, to, piece) => {
                const promoting = piece[1] === "P" && (to[1] === "8" || to[1] === "1");
                return play(`${from}${to}${promoting ? "q" : ""}`);
              }}
              onPromotionPieceSelect={(piece, from, to) =>
                Boolean(piece && from && to && play(`${from}${to}${piece[1].toLowerCase()}`))
              }
              customArrows={arrows}
              customSquareStyles={squareStyles}
              animationDuration={200}
              customBoardStyle={{ borderRadius: "6px", boxShadow: "0 6px 24px rgba(0,0,0,0.18)" }}
              customDarkSquareStyle={{ backgroundColor: "#7c945d" }}
              customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
            />
          </div>

          <div className="player-strip">
            <span className={`dot ${settings.myColor}`} />
            You ({colorName(settings.myColor)}) · graded
          </div>

          {reviewing && shown && (
            <div className="banner review">
              Showing the position before {moveNumber(selected)} {shown.san}
              <span className="legend">
                <i style={{ background: PLAYED_ARROW }} /> {shown.graded ? "your move" : "move played"}
                {shown.grade && shown.grade.bestMoves[0]?.uci !== shown.uci && (
                  <>
                    <i style={{ background: BEST_ARROW }} /> engine's best
                  </>
                )}
              </span>
              <button onClick={() => setSelected(null)}>Back to game</button>
            </div>
          )}
          {result && !reviewing && <div className="banner result">{result}</div>}
          {botError && (
            <div className="banner error">
              The bot couldn't move: {botError}
              <button onClick={() => setBotError(null)}>Try again</button>
            </div>
          )}
          {!reviewing && !result && !botError && (
            <p className="hint">
              {humanTurn
                ? `${colorName(turn)} to move${settings.mode === "both" && turn !== settings.myColor ? " (not graded)" : ""}.`
                : "Waiting for the bot…"}
            </p>
          )}
        </section>

        <aside className="side-col">
          <SetupCard draft={draft} onChange={setDraft} onNewGame={newGame} />
          <MoveList moves={moves} selected={selected} onSelect={(i) => setSelected(i === selected ? null : i)} />
          <MovePanel
            move={panelIndex === null ? undefined : moves[panelIndex]}
            index={panelIndex}
            myColor={settings.myColor}
            onBoard={reviewing}
            coach={status?.coach ?? null}
            onExplain={explain}
            onRetry={retry}
            onRegrade={(i) => grade(moves[i])}
            onShowOnBoard={(i) => setSelected(i)}
          />
        </aside>
      </main>
    </div>
  );
}

function StatusPills({ status }: { status: StatusResponse | null }) {
  if (!status) {
    return (
      <div className="pills">
        <span className="pill bad">Server offline</span>
      </div>
    );
  }
  return (
    <div className="pills">
      <span className={`pill ${status.engine.ready ? "ok" : "bad"}`} title={status.engine.error}>
        Engine {status.engine.ready ? "ready" : "unavailable"}
      </span>
      <span className={`pill ${status.coach.ready ? "ok" : "warn"}`} title={status.coach.error}>
        Coach {status.coach.ready ? status.coach.model : "needs API key"}
      </span>
    </div>
  );
}
