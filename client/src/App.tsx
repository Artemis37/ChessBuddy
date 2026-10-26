import { Chess, type Square } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  divergence,
  openingFor,
  positionKey,
  readLines,
  type OpeningBook,
  type OpeningLibrary,
  type OpeningLine,
} from "../../shared/openings";
import {
  COACH_MODELS,
  type Color,
  type MoveGrade,
  type OpeningContext,
  type PositionEval,
  type StatusResponse,
} from "../../shared/types";
import { api } from "./api";
import { Board, type BoardArrow } from "./board/Board";
import { EvalBar } from "./board/EvalBar";
import { capturedBy, capturedInPosition, materialBalance } from "./board/material";
import type { Premove } from "./board/placement";
import { PlayerBar } from "./board/PlayerBar";
import { MoveList } from "./components/MoveList";
import { MovePanel } from "./components/MovePanel";
import { OpeningsCard } from "./components/OpeningsCard";
import { SetupCard } from "./components/SetupCard";
import { colorName, moveNumber, type PlayedMove, type Settings } from "./game";
import { activePath, addExchange, showVersion } from "./thread";

const START_FEN = new Chess().fen();
const BEST_ARROW = "rgba(129, 182, 76, 0.95)";
/** A book move under the pointer while learning an opening. */
const BOOK_ARROW = "rgba(82, 155, 220, 0.85)";
const NO_BOOK_MOVES: Record<string, string[]> = {};
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

/** An opening line's moves from the starting position, as book moves on the board. */
function lineMoves(sans: string[], ids: { current: number }): PlayedMove[] {
  const board = new Chess();
  return sans.map((san) => {
    const fenBefore = board.fen();
    const made = board.move(san);
    return {
      id: ids.current++,
      san: made.san,
      uci: made.lan,
      color: made.color,
      captured: made.captured,
      fenBefore,
      fenAfter: board.fen(),
      graded: false,
      book: true,
    };
  });
}

function lastGradedIndex(moves: PlayedMove[]): number | null {
  for (let i = moves.length - 1; i >= 0; i--) if (moves[i].graded) return i;
  return null;
}

/** An explanation being played on the board. */
interface Walkthrough {
  moveId: number;
  /** Which answer of the move's thread, as shown, is playing; null for the explanation itself. */
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

export function App({ user, onSignOut }: { user: string; onSignOut: () => void }) {
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
  /** Opening lines and book moves, loaded the first time you learn openings. */
  const [library, setLibrary] = useState<OpeningLibrary | null>(null);
  /** The opening line being learned. */
  const [study, setStudy] = useState<OpeningLine | null>(null);
  /** The book move under the pointer, with the position it was listed for. */
  const [bookHover, setBookHover] = useState<{ fen: string; uci: string } | null>(null);
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
  const learning = settings.mode === "learn";
  const humanTurn = settings.mode === "both" || turn === settings.myColor;
  const coachModel =
    chosenModel && COACH_MODELS.some((m) => m.id === chosenModel)
      ? chosenModel
      : (status?.coach.defaultModel ?? COACH_MODELS[0].id);

  useEffect(() => {
    let alive = true;
    // Only while the tab is visible: a request every 15 seconds keeps a scale-to-zero host
    // (Azure Container Apps) running, so a forgotten background tab would use up its free hours.
    const load = () => {
      if (document.hidden) return;
      api.status().then(
        (s) => alive && setStatus(s),
        () => alive && setStatus(null),
      );
    };
    load();
    const timer = setInterval(load, 15_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  useEffect(() => {
    fetch("/openings.json")
      .then((r) => r.json())
      .then(setBook, () => setBook({}));
  }, []);

  useEffect(() => {
    if (draft.mode !== "learn" || library) return;
    fetch("/opening-lines.json")
      .then((r) => r.json())
      .then(setLibrary, () => setLibrary({ lines: [], next: {} }));
  }, [draft.mode, library]);
  const openingLines = useMemo(() => (library ? readLines(library.lines) : null), [library]);

  const updateMove = useCallback((id: number, patch: Partial<PlayedMove>) => {
    setMoves((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  /** Grades a move; resolves to null if the engine fails, which the move then shows. */
  const grade = useCallback(
    (move: PlayedMove): Promise<MoveGrade | null> => {
      updateMove(move.id, { grading: true, gradeError: undefined });
      return api.grade(move.fenBefore, move.uci).then(
        (g) => {
          updateMove(move.id, { grade: g, grading: false });
          return g;
        },
        (err: Error) => {
          updateMove(move.id, { gradeError: err.message, grading: false });
          return null;
        },
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
        // Playing both sides you move every piece, so every move is graded.
        graded: settings.mode === "both" || made.color === settings.myColor,
      };
      setMoves((list) => [...list, move]);
      if (move.graded) grade(move);
      return true;
    },
    [fen, settings.mode, settings.myColor, grade],
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
        : (activePath(walkMove.thread)[walkthrough.reply]?.exchange.reply.steps ?? []);
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
    setStudy(null);
  };

  /** Starts learning an opening line from its first position, with its moves ready to step through. */
  const startStudy = (line: OpeningLine) => {
    gameToken.current++;
    setSettings({ ...draft, mode: "learn" });
    setStudy(line);
    setMoves(lineMoves(line.moves, nextId));
    setViewPly(0);
    setPremoves([]);
    setFlipped(false);
    setBotError(null);
    setWalkthrough(null);
  };

  const changeDraft = (next: Settings) => {
    setDraft(next);
    // While learning an opening, your color only turns the board, so it applies at once.
    if (settings.mode === "learn" && next.mode === "learn") setSettings((s) => ({ ...s, myColor: next.myColor }));
  };

  const retry = (index: number) => rewind(moves.length - index);

  // In bot mode, undo takes back the bot's reply together with your move, so it is your turn again.
  const canUndo = settings.mode === "bot" ? moves.some((m) => m.color === settings.myColor) : moves.length > 0;
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

  /** Learning an opening: what the coach needs to know about it to explain a move. */
  const openingContext = (index: number): OpeningContext | undefined => {
    if (!learning || !study || !library) return undefined;
    const move = moves[index];
    const onLine = moves.slice(0, index).every((m, i) => m.san === study.moves[i]);
    return {
      studying: study.name,
      reached: book ? (openingFor([move.fenAfter], book)?.name ?? null) : null,
      bookMove: Boolean(move.book),
      bookMoves: library.next[positionKey(move.fenBefore)] ?? [],
      line: onLine ? study.moves.slice(index) : [],
    };
  };

  // Book moves aren't graded until they are explained, so explaining grades them first.
  const explain = (index: number) => {
    const move = moves[index];
    if (!move || move.explaining || move.grading) return;
    updateMove(move.id, { explaining: true, explainError: undefined });
    const perspective = move.color === settings.myColor ? "mine" : "opponent";
    const history = moves.slice(0, index).map((m) => m.san);
    const opening = openingContext(index);
    (move.grade ? Promise.resolve(move.grade) : grade(move))
      .then((g) => {
        if (!g) throw new Error("The move couldn't be analyzed.");
        return api.explain(g, history, coachModel, perspective, opening);
      })
      .then(
        (explanation) => {
          // Earlier questions were about the old explanation.
          updateMove(move.id, { explanation, explaining: false, thread: null, askError: undefined });
          if (explanation.steps.length > 0) showStep(move.id, 0);
        },
        (err: Error) => updateMove(move.id, { explaining: false, explainError: err.message }),
      );
  };

  /** Stops playing the move's answers from `depth` on, which are about to be hidden or replaced. */
  const stopAnswersFrom = (moveId: number, depth: number) => {
    setWalkthrough((w) => (w && w.moveId === moveId && w.reply !== null && w.reply >= depth ? null : w));
  };

  /**
   * Asks a question about the explanation. With `depth`, it replaces the question there, the way
   * an edit does on claude.ai: the answer becomes a new version of that question, and the old
   * version keeps the questions that followed it. The coach sees only the questions before it.
   */
  const ask = (index: number, question: string, depth?: number) => {
    const move = moves[index];
    if (!move?.grade || !move.explanation || move.asking || move.explaining) return;
    const shown = activePath(move.thread);
    const at = Math.min(depth ?? shown.length, shown.length);
    updateMove(move.id, { asking: { question, depth: at }, askError: undefined });
    stopAnswersFrom(move.id, at);
    const perspective = move.color === settings.myColor ? "mine" : "opponent";
    const explanation = move.explanation;
    api
      .ask(
        move.grade,
        moves.slice(0, index).map((m) => m.san),
        coachModel,
        perspective,
        { summary: explanation.summary, steps: explanation.steps.map((s) => s.caption), lesson: explanation.lesson },
        shown
          .slice(0, at)
          .map(({ exchange: e }) => ({ question: e.question, answer: e.reply.answer, steps: e.reply.steps.map((s) => s.caption) })),
        question,
        openingContext(index),
      )
      .then(
        (reply) => {
          setMoves((list) =>
            list.map((m) =>
              m.id === move.id ? { ...m, asking: undefined, thread: addExchange(m.thread, at, { question, reply }) } : m,
            ),
          );
          if (reply.steps.length > 0) showStep(move.id, 0, at);
        },
        (err: Error) => updateMove(move.id, { asking: undefined, askError: err.message }),
      );
  };

  /** Shows another version of a question in a move's thread, with the questions that followed it. */
  const showQuestionVersion = (index: number, depth: number, version: number) => {
    const move = moves[index];
    if (!move?.thread || move.asking) return;
    updateMove(move.id, { thread: showVersion(move.thread, depth, version), askError: undefined });
    stopAnswersFrom(move.id, depth);
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
  // Learning an opening, the panel follows the board even through ungraded book moves.
  const panelIndex = learning ? (shownCount > 0 ? shownCount - 1 : null) : live ? lastGradedIndex(moves) : shownCount - 1;

  /**
   * Learning an opening, you move from whatever position the board shows: the next move in the
   * list just steps forward, and any other move replaces the moves after this point. Moves off
   * the book are graded.
   */
  const explore = (uci: string): boolean => {
    if (moves[shownCount]?.uci === uci) {
      goTo(shownCount + 1);
      return true;
    }
    const board = new Chess(displayFen);
    let made;
    try {
      made = board.move(toMove(uci));
    } catch {
      return false;
    }
    const inBook = Boolean(library?.next[positionKey(displayFen)]?.includes(made.san));
    const move: PlayedMove = {
      id: nextId.current++,
      san: made.san,
      uci: made.lan,
      color: made.color,
      captured: made.captured,
      fenBefore: displayFen,
      fenAfter: board.fen(),
      graded: !inBook,
      book: inBook,
    };
    setMoves([...moves.slice(0, shownCount), move]);
    setViewPly(null);
    setWalkthrough(null);
    if (move.graded) grade(move);
    return true;
  };

  /** Puts the line's moves back where you left it, keeping the moves before that, and shows that position. */
  const leftLineAt = study ? divergence(study.moves, moves.map((m) => m.san)) : null;
  const backToLine = () => {
    if (!study || leftLineAt === null) return;
    setMoves([...moves.slice(0, leftLineAt), ...lineMoves(study.moves, nextId).slice(leftLineAt)]);
    setViewPly(leftLineAt);
    setWalkthrough(null);
  };

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
  const hovered = bookHover?.fen === displayFen ? toMove(bookHover.uci) : null;
  if (walkStep) {
    if (walkView?.done) {
      for (const a of walkStep.arrows) arrows.push({ from: a.from as Square, to: a.to as Square, color: STEP_ARROW });
    }
  } else if (hovered) {
    arrows.push({ from: hovered.from, to: hovered.to, color: BOOK_ARROW });
  } else if (best) {
    const bestMove = toMove(best.uci);
    arrows.push({ from: bestMove.from, to: bestMove.to, color: BEST_ARROW });
  }
  const marks = walkStep && walkView?.done ? walkStep.marks : [];

  // Learning an opening, the side to move in the position shown may move, wherever that is in the list.
  const movable: Color | null = learning
    ? walkView
      ? null
      : (displayFen.split(" ")[1] as Color)
    : live && !walkView && !result && humanTurn && !botThinking
      ? turn
      : null;
  const premoveColor: Color | null =
    live && !walkView && !result && settings.mode === "bot" && turn !== settings.myColor ? settings.myColor : null;
  const botLabel = settings.rating === "max" ? "Maximum" : `${settings.rating}`;

  const playerName = (color: Color) =>
    color === settings.myColor ? "You" : settings.mode === "bot" ? "Stockfish" : colorName(color);
  const playerBar = (color: Color) => {
    const mine = color === settings.myColor;
    const detail = mine
      ? settings.mode !== "bot"
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
        <div className="topbar-right">
          <StatusPills status={status} />
          <div className="account">
            <span title="Signed in">{user}</span>
            <button onClick={onSignOut}>Sign out</button>
          </div>
        </div>
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
                  onMove={(from, to, promotion) => (learning ? explore : play)(`${from}${to}${promotion ?? ""}`)}
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
          <SetupCard draft={draft} onChange={changeDraft} onNewGame={newGame} />
          {(draft.mode === "learn" || learning) && (
            <OpeningsCard
              lines={openingLines}
              next={library?.next ?? NO_BOOK_MOVES}
              book={book}
              study={learning ? study : null}
              moves={moves}
              shown={shownCount}
              fen={displayFen}
              onPick={startStudy}
              onPlay={explore}
              onHover={(uci) => setBookHover(uci ? { fen: displayFen, uci } : null)}
              onBackToLine={backToLine}
            />
          )}
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
            bothSides={settings.mode === "both"}
            learning={learning}
            onBoard={learning || (!live && panelIndex === shownCount - 1)}
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
            onShowVersion={showQuestionVersion}
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
