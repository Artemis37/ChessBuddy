import { Chess, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openingFor, type OpeningBook } from "../../shared/openings";
import { COACH_MODELS, type Color, type PositionEval, type StatusResponse } from "../../shared/types";
import { api } from "./api";
import { Board, type BoardArrow } from "./board/Board";
import { EvalBar } from "./board/EvalBar";
import { capturedBy, capturedInPosition, materialBalance } from "./board/material";
import type { Premove } from "./board/placement";
import { PlayerBar } from "./board/PlayerBar";
import { MoveList } from "./components/MoveList";
import { MovePanel } from "./components/MovePanel";
import { SetupCard } from "./components/SetupCard";
import { colorName, moveNumber, type PlayedMove, type Settings } from "./game";

const START_FEN = new Chess().fen();
const BEST_ARROW = "rgba(129, 182, 76, 0.95)";
/** chess.com's arrow color, for the attacks and threats an explanation points out. */
const STEP_ARROW = "rgba(255, 170, 0, 0.9)";
/** Pause before a step's first move, so the jump to its starting position is seen first. */
const STEP_START_MS = 500;
const STEP_MOVE_MS = 650;
const BOT_MIN_THINK_MS = 400;
/** Pause before a premove is played, so the opponent's move is seen first. */
const PREMOVE_DELAY_MS = 120;
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

function scoreText(game: Chess): string {
  if (game.isCheckmate()) return game.turn() === "w" ? "0-1" : "1-0";
  if (game.isDraw() || game.isStalemate()) return "½-½";
  return "*";
}

function lastGradedIndex(moves: PlayedMove[]): number | null {
  for (let i = moves.length - 1; i >= 0; i--) if (moves[i].graded) return i;
  return null;
}

/** An explanation being played on the board. */
interface Walkthrough {
  moveId: number;
  /** Which answer in the move's thread is playing; null for the explanation itself. */
  reply: number | null;
  step: number;
  /** How many of the step's moves the board has played so far. */
  played: number;
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
  /** Number of moves shown on the board while stepping through the game; null follows the game. */
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [premoves, setPremoves] = useState<Premove[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [chosenModel, setChosenModel] = useState(loadModel);
  const [evals, setEvals] = useState<Record<string, PositionEval>>({});
  const [book, setBook] = useState<OpeningBook | null>(null);
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
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
  const live = viewPly === null || viewPly >= moves.length;
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

  useEffect(() => {
    fetch("/openings.json")
      .then((r) => r.json())
      .then(setBook, () => setBook({}));
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
    // `play` changes with every move; the position (fen) already covers that.
  }, [fen, turn, result, settings, botError]);

  // Once it is your turn again, play the first queued premove; if it is illegal now, drop them all.
  useEffect(() => {
    if (premoves.length === 0 || result || turn !== settings.myColor || settings.mode !== "bot") return;
    const timer = setTimeout(() => {
      const [next, ...rest] = premoves;
      const board = new Chess(fen);
      const legal = board
        .moves({ square: next.from, verbose: true })
        .find((m) => m.to === next.to && (!m.promotion || m.promotion === "q"));
      if (legal && play(legal.lan)) setPremoves(rest);
      else setPremoves([]);
    }, PREMOVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [premoves, fen, turn, result, settings, play]);

  const walkMoveIndex = walkthrough ? moves.findIndex((m) => m.id === walkthrough.moveId) : -1;
  const walkMove = walkMoveIndex >= 0 ? moves[walkMoveIndex] : undefined;
  const walkSteps =
    !walkthrough || !walkMove
      ? []
      : walkthrough.reply === null
        ? (walkMove.explanation?.steps ?? [])
        : (walkMove.thread?.[walkthrough.reply]?.reply.steps ?? []);
  const walkStep = walkthrough ? walkSteps[walkthrough.step] : undefined;

  // Plays the current step's moves one at a time.
  useEffect(() => {
    if (!walkthrough || !walkStep || walkthrough.played >= walkStep.moves.length) return;
    const timer = setTimeout(
      () => setWalkthrough((w) => w && { ...w, played: w.played + 1 }),
      walkthrough.played === 0 ? STEP_START_MS : STEP_MOVE_MS,
    );
    return () => clearTimeout(timer);
  }, [walkthrough, walkStep]);

  /** Plays a step of a move's explanation, or of one of its answers, on the board from its start. */
  const showStep = useCallback((moveId: number, step: number, reply: number | null = null) => {
    setWalkthrough({ moveId, reply, step, played: 0 });
    setPremoves([]);
  }, []);

  const rewind = (count: number) => {
    gameToken.current++;
    setMoves((list) => list.slice(0, list.length - count));
    setViewPly(null);
    setPremoves([]);
    setBotError(null);
    setWalkthrough(null);
  };

  const newGame = () => {
    gameToken.current++;
    setSettings(draft);
    setMoves([]);
    setViewPly(null);
    setPremoves([]);
    setFlipped(false);
    setBotError(null);
    setWalkthrough(null);
  };

  const retry = (index: number) => rewind(moves.length - index);

  // In bot mode, undo takes back the bot's reply together with your move, so it is your turn again.
  const canUndo = settings.mode === "both" ? moves.length > 0 : moves.some((m) => m.color === settings.myColor);
  const undo = () => {
    if (!canUndo) return;
    const last = moves[moves.length - 1];
    rewind(settings.mode === "bot" && last.color !== settings.myColor ? 2 : 1);
  };

  /** Shows the position after `ply` moves; the last position resumes the game. */
  const goTo = useCallback(
    (ply: number) => {
      const clamped = Math.max(0, Math.min(moves.length, ply));
      setViewPly(clamped >= moves.length ? null : clamped);
      if (clamped < moves.length) setPremoves([]);
      setWalkthrough(null);
    },
    [moves.length],
  );
  const shownCount = live ? moves.length : viewPly!;

  // Arrow keys step through the game, as on chess.com; during an explanation they step through
  // its steps, and Esc goes back to the game.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (walkthrough && walkStep) {
        const last = walkSteps.length - 1;
        if (event.key === "Escape") setWalkthrough(null);
        else if (event.key === "ArrowLeft") {
          showStep(walkthrough.moveId, Math.max(0, walkthrough.step - 1), walkthrough.reply);
        } else if (event.key === "ArrowRight") {
          showStep(walkthrough.moveId, Math.min(last, walkthrough.step + 1), walkthrough.reply);
        }
        else return;
        event.preventDefault();
        return;
      }
      const steps: Record<string, number> = { ArrowLeft: shownCount - 1, ArrowRight: shownCount + 1, Home: 0 };
      if (event.key === "End") goTo(moves.length);
      else if (event.key in steps) goTo(steps[event.key]);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, shownCount, moves.length, walkthrough, walkStep, walkSteps.length, showStep]);

  const explain = (index: number) => {
    const move = moves[index];
    if (!move?.grade) return;
    updateMove(move.id, { explaining: true, explainError: undefined });
    const perspective = move.color === settings.myColor ? "mine" : "opponent";
    api.explain(move.grade, moves.slice(0, index).map((m) => m.san), coachModel, perspective).then(
      (explanation) => {
        // Earlier questions were about the old explanation.
        updateMove(move.id, { explanation, explaining: false, thread: [], askError: undefined });
        if (explanation.steps.length > 0) showStep(move.id, 0);
      },
      (err: Error) => updateMove(move.id, { explaining: false, explainError: err.message }),
    );
  };

  const ask = (index: number, question: string) => {
    const move = moves[index];
    if (!move?.grade || !move.explanation || move.asking || move.explaining) return;
    updateMove(move.id, { asking: question, askError: undefined });
    const perspective = move.color === settings.myColor ? "mine" : "opponent";
    const thread = move.thread ?? [];
    const explanation = move.explanation;
    api
      .ask(
        move.grade,
        moves.slice(0, index).map((m) => m.san),
        coachModel,
        perspective,
        { summary: explanation.summary, steps: explanation.steps.map((s) => s.caption), lesson: explanation.lesson },
        thread.map((e) => ({ question: e.question, answer: e.reply.answer, steps: e.reply.steps.map((s) => s.caption) })),
        question,
      )
      .then(
        (reply) => {
          setMoves((list) =>
            list.map((m) =>
              m.id === move.id ? { ...m, asking: undefined, thread: [...(m.thread ?? []), { question, reply }] } : m,
            ),
          );
          if (reply.steps.length > 0) showStep(move.id, 0, thread.length);
        },
        (err: Error) => updateMove(move.id, { asking: undefined, askError: err.message }),
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

  const displayFen = shownCount === 0 ? START_FEN : moves[shownCount - 1].fenAfter;
  const shownMove = shownCount > 0 ? moves[shownCount - 1] : null;
  const panelIndex = live ? lastGradedIndex(moves) : shownCount - 1;

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

  // While an explanation plays, the board shows its step instead of the game.
  const walkView = useMemo(() => {
    if (!walkthrough || !walkStep) return null;
    const board = new Chess(walkStep.fen);
    const shown = walkStep.moves.slice(0, walkthrough.played);
    for (const m of shown) board.move(toMove(m.uci));
    const last = shown[shown.length - 1];
    return { fen: board.fen(), lastMove: last ? toMove(last.uci) : null, done: shown.length === walkStep.moves.length };
  }, [walkthrough, walkStep]);

  const opening = book ? openingFor(moves.slice(0, shownCount).map((m) => m.fenAfter), book) : null;
  const orientation: Color = flipped ? other(settings.myColor) : settings.myColor;
  const boardFen = walkView ? walkView.fen : displayFen;
  const captured = walkView ? capturedInPosition(boardFen) : capturedBy(moves.slice(0, shownCount));
  const balance = materialBalance(boardFen);
  const boardEvaluation = walkStep
    ? walkView?.done
      ? walkStep.evaluation
      : (gradeEvals.get(walkStep.fen) ?? walkStep.evaluation)
    : evaluation;

  const arrows: BoardArrow[] = [];
  const best = !live && shownMove?.grade && !shownMove.grade.isBest ? shownMove.grade.bestMoves[0] : undefined;
  if (walkStep) {
    if (walkView?.done) {
      for (const a of walkStep.arrows) arrows.push({ from: a.from as Square, to: a.to as Square, color: STEP_ARROW });
    }
  } else if (best) {
    const bestMove = toMove(best.uci);
    arrows.push({ from: bestMove.from, to: bestMove.to, color: BEST_ARROW });
  }
  const marks = walkStep && walkView?.done ? walkStep.marks : [];

  const movable: Color | null = live && !walkView && !result && humanTurn && !botThinking ? turn : null;
  const premoveColor: Color | null =
    live && !walkView && !result && settings.mode === "bot" && turn !== settings.myColor ? settings.myColor : null;
  const botLabel = settings.rating === "max" ? "Maximum" : `${settings.rating}`;

  const playerName = (color: Color) =>
    color === settings.myColor ? "You" : settings.mode === "bot" ? "Stockfish" : colorName(color);
  const playerBar = (color: Color) => {
    const mine = color === settings.myColor;
    const detail = mine
      ? settings.mode === "both"
        ? colorName(color)
        : undefined
      : settings.mode === "bot"
        ? botLabel
        : "you move it";
    return (
      <PlayerBar
        name={playerName(color)}
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
        <div className="board-dock">
          <section className="board-col">
            {walkthrough && walkStep && (
              <div className="walk-strip">
                <span>
                  Explaining{" "}
                  <strong>
                    {moveNumber(walkMoveIndex)} {moves[walkMoveIndex].san}
                  </strong>{" "}
                  · {walkthrough.reply !== null && "answer · "}step {walkthrough.step + 1} of {walkSteps.length}
                </span>
                <button onClick={() => setWalkthrough(null)} title="Back to the game (Esc)">
                  <span aria-hidden>✕</span> Esc
                </button>
              </div>
            )}
            {playerBar(other(orientation))}
            <div className="board-row">
              <EvalBar evaluation={boardEvaluation} orientation={orientation} />
              <div className="board-wrap">
                <Board
                  fen={boardFen}
                  orientation={orientation}
                  movable={movable}
                  premoveColor={premoveColor}
                  premoves={live && !walkView ? premoves : []}
                  lastMove={walkView ? walkView.lastMove : shownMove ? toMove(shownMove.uci) : null}
                  arrows={arrows}
                  marks={marks}
                  onMove={(from, to, promotion) => play(`${from}${to}${promotion ?? ""}`)}
                  onPremove={(premove) => setPremoves((list) => [...list, premove])}
                  onCancelPremoves={() => setPremoves([])}
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
            </div>

            {result && live && <div className="banner result">{result}</div>}
            {botError && (
              <div className="banner error">
                The bot couldn't move: {botError}
                <button onClick={() => setBotError(null)}>Try again</button>
              </div>
            )}
          </section>
        </div>

        <aside className="side-col">
          <SetupCard draft={draft} onChange={setDraft} onNewGame={newGame} />
          <MoveList
            moves={moves}
            current={shownCount - 1}
            opening={opening}
            white={playerName("w")}
            black={playerName("b")}
            score={scoreText(game)}
            onSelect={(i) => goTo(i + 1)}
            onFirst={() => goTo(0)}
            onPrevious={() => goTo(shownCount - 1)}
            onNext={() => goTo(shownCount + 1)}
            onLast={() => goTo(moves.length)}
          />
          <MovePanel
            move={panelIndex === null ? undefined : moves[panelIndex]}
            index={panelIndex}
            myColor={settings.myColor}
            onBoard={!live && panelIndex === shownCount - 1}
            coach={status?.coach ?? null}
            model={coachModel}
            onModelChange={chooseModel}
            onExplain={explain}
            onRetry={retry}
            onAnalyze={(i) => grade(moves[i])}
            onShowOnBoard={(i) => goTo(i + 1)}
            active={
              panelIndex !== null && walkthrough?.moveId === moves[panelIndex]?.id && walkStep
                ? { reply: walkthrough.reply, step: walkthrough.step }
                : null
            }
            onShowStep={(i, step, reply) => showStep(moves[i].id, step, reply)}
            onAsk={ask}
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
