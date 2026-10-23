import { Chess, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COACH_MODELS, type Color, type PositionEval, type StatusResponse } from "../../shared/types";
import { api } from "./api";
import { Board, type BoardArrow } from "./board/Board";
import { EvalBar } from "./board/EvalBar";
import { capturedBy, materialBalance } from "./board/material";
import { PlayerBar } from "./board/PlayerBar";
import { MoveList } from "./components/MoveList";
import { MovePanel } from "./components/MovePanel";
import { SetupCard } from "./components/SetupCard";
import { colorName, moveNumber, type PlayedMove, type Settings } from "./game";

const PLAYED_ARROW = "rgba(232, 150, 30, 0.9)";
const BEST_ARROW = "rgba(129, 182, 76, 0.95)";
const BOT_MIN_THINK_MS = 400;
const MODEL_KEY = "chessbuddy.coachModel";

function toMove(uci: string) {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] };
}

function other(color: Color): Color {
  return color === "w" ? "b" : "w";
}

function resultText(game: Chess): string | null {
  if (game.isCheckmate()) return `Checkmate. ${colorName(other(game.turn()))} wins.`;
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

function loadModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function App() {
  const [draft, setDraft] = useState<Settings>({ mode: "bot", myColor: "w", rating: 1000 });
  const [settings, setSettings] = useState<Settings>(draft);
  const [moves, setMoves] = useState<PlayedMove[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [chosenModel, setChosenModel] = useState(loadModel);
  const [evals, setEvals] = useState<Record<string, PositionEval>>({});
  /** Move count right after a new move, so only that move slides into place. */
  const [animateAt, setAnimateAt] = useState(-1);
  const nextId = useRef(1);
  /** Bumped whenever the move list is rewritten, so late bot replies are dropped. */
  const gameToken = useRef(0);
  const evalRequested = useRef(new Set<string>());

  const game = useMemo(() => {
    const g = new Chess();
    for (const m of moves) g.move(toMove(m.uci));
    return g;
  }, [moves]);
  const fen = game.fen();
  const turn = game.turn();
  const result = resultText(game);
  const humanTurn = settings.mode === "both" || turn === settings.myColor;
  const coachModel =
    chosenModel && COACH_MODELS.some((m) => m.id === chosenModel)
      ? chosenModel
      : (status?.coach.defaultModel ?? COACH_MODELS[0].id);

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
      updateMove(move.id, { grading: true, gradeError: undefined });
      api.grade(move.fenBefore, move.uci).then(
        (g) => updateMove(move.id, { grade: g, grading: false }),
        (err: Error) => updateMove(move.id, { gradeError: err.message, grading: false }),
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
        captured: made.captured,
        fenBefore: fen,
        fenAfter: board.fen(),
        graded: made.color === settings.myColor,
      };
      setMoves((list) => [...list, move]);
      setAnimateAt(moves.length + 1);
      setSelected(null);
      if (move.graded) grade(move);
      return true;
    },
    [fen, moves.length, settings.myColor, grade],
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
    // `play` changes with every move; the position (fen) already covers that.
  }, [fen, turn, result, settings, botError]);

  const rewind = (count: number) => {
    gameToken.current++;
    setMoves((list) => list.slice(0, list.length - count));
    setSelected(null);
    setBotError(null);
    setAnimateAt(-1);
  };

  const newGame = () => {
    gameToken.current++;
    setSettings(draft);
    setMoves([]);
    setSelected(null);
    setFlipped(false);
    setBotError(null);
    setAnimateAt(-1);
  };

  const retry = (index: number) => rewind(moves.length - index);

  // In bot mode, undo takes back the bot's reply together with your move, so it is your turn again.
  const canUndo = settings.mode === "both" ? moves.length > 0 : moves.some((m) => m.color === settings.myColor);
  const undo = () => {
    if (!canUndo) return;
    const last = moves[moves.length - 1];
    rewind(settings.mode === "bot" && last.color !== settings.myColor ? 2 : 1);
  };

  const explain = (index: number) => {
    const move = moves[index];
    if (!move?.grade) return;
    updateMove(move.id, { explaining: true, explainError: undefined });
    const perspective = move.color === settings.myColor ? "mine" : "opponent";
    api.explain(move.grade, moves.slice(0, index).map((m) => m.san), coachModel, perspective).then(
      (explanation) => updateMove(move.id, { explanation, explaining: false }),
      (err: Error) => updateMove(move.id, { explaining: false, explainError: err.message }),
    );
  };

  const chooseModel = (id: string) => {
    setChosenModel(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      // Storage unavailable: the choice lasts until the page reloads.
    }
  };

  const reviewing = selected !== null && moves[selected] !== undefined;
  const shown = reviewing ? moves[selected] : null;
  const shownCount = reviewing ? selected : moves.length;
  const displayFen = shown ? shown.fenBefore : fen;
  const panelIndex = reviewing ? selected : lastGradedIndex(moves);

  // Evaluation bar: reuse grades where possible, otherwise ask the engine once per position.
  const gradeEvals = useMemo(() => {
    const map = new Map<string, PositionEval>();
    for (const m of moves) {
      if (!m.grade) continue;
      map.set(m.grade.fenBefore, m.grade.positionBefore);
      map.set(m.grade.fenAfter, m.grade.positionAfter);
    }
    return map;
  }, [moves]);
  const evaluation = gradeEvals.get(displayFen) ?? evals[displayFen] ?? null;
  const gradeComing = moves.some((m) => m.grading && (m.fenAfter === displayFen || m.fenBefore === displayFen));
  useEffect(() => {
    if (evaluation || gradeComing || evalRequested.current.has(displayFen)) return;
    evalRequested.current.add(displayFen);
    api.evaluate(displayFen).then(
      (e) => setEvals((all) => ({ ...all, [displayFen]: e })),
      () => evalRequested.current.delete(displayFen),
    );
  }, [displayFen, evaluation, gradeComing]);

  const orientation: Color = flipped ? other(settings.myColor) : settings.myColor;
  const captured = capturedBy(moves.slice(0, shownCount));
  const balance = materialBalance(displayFen);
  const lastShown = shownCount > 0 ? toMove(moves[shownCount - 1].uci) : null;

  const arrows: BoardArrow[] = [];
  if (shown) {
    const played = toMove(shown.uci);
    arrows.push({ from: played.from, to: played.to, color: PLAYED_ARROW });
    const best = shown.grade?.bestMoves[0];
    if (best && best.uci !== shown.uci) {
      const bestMove = toMove(best.uci);
      arrows.push({ from: bestMove.from, to: bestMove.to, color: BEST_ARROW });
    }
  }

  const movable: Color | null = !reviewing && !result && humanTurn && !botThinking ? turn : null;
  const botLabel = settings.rating === "max" ? "Maximum" : `${settings.rating}`;

  const playerBar = (color: Color) => {
    const mine = color === settings.myColor;
    const name = mine ? "You" : settings.mode === "bot" ? "Stockfish" : colorName(color);
    const detail = mine
      ? settings.mode === "both"
        ? colorName(color)
        : undefined
      : settings.mode === "bot"
        ? botLabel
        : "you move it";
    return (
      <PlayerBar
        name={name}
        detail={detail}
        color={color}
        captured={captured[color]}
        lead={color === "w" ? balance : -balance}
        thinking={!mine && settings.mode === "bot" && botThinking}
      />
    );
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <img src="/pieces/staunty/wN.svg" alt="" aria-hidden /> ChessBuddy
        </h1>
        <StatusPills status={status} />
      </header>

      <main className="layout">
        <section className="board-col">
          {playerBar(other(orientation))}
          <div className="board-row">
            <EvalBar evaluation={evaluation} orientation={orientation} />
            <div className="board-wrap">
              <Board
                fen={displayFen}
                orientation={orientation}
                movable={movable}
                lastMove={lastShown}
                animateLastMove={!reviewing && animateAt === moves.length}
                arrows={arrows}
                onMove={(from, to, promotion) => play(`${from}${to}${promotion ?? ""}`)}
              />
            </div>
          </div>
          {playerBar(orientation)}

          <div className="board-controls">
            <button onClick={undo} disabled={!canUndo} title="Take back your last move">
              <span aria-hidden>↶</span> Undo
            </button>
            <button onClick={() => setFlipped((f) => !f)} title="Turn the board around">
              <span aria-hidden>⇅</span> Flip board
            </button>
            {reviewing && <button onClick={() => setSelected(null)}>Back to game</button>}
          </div>

          {reviewing && shown && (
            <div className="banner review">
              Showing the position before {moveNumber(selected)} {shown.san}
              <span className="legend">
                <i style={{ background: PLAYED_ARROW }} /> {shown.color === settings.myColor ? "your move" : "move played"}
                {shown.grade && shown.grade.bestMoves[0]?.uci !== shown.uci && (
                  <>
                    <i style={{ background: BEST_ARROW }} /> engine's best
                  </>
                )}
              </span>
            </div>
          )}
          {result && !reviewing && <div className="banner result">{result}</div>}
          {botError && (
            <div className="banner error">
              The bot couldn't move: {botError}
              <button onClick={() => setBotError(null)}>Try again</button>
            </div>
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
            model={coachModel}
            onModelChange={chooseModel}
            onExplain={explain}
            onRetry={retry}
            onAnalyze={(i) => grade(moves[i])}
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
        {status.coach.ready ? "Coach ready" : "Coach needs API key"}
      </span>
    </div>
  );
}
