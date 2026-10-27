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
  isVipModel,
  type Color,
  type MoveGrade,
  type OpeningContext,
  type PositionEval,
  type SessionResponse,
  type StatusResponse,
} from "../../shared/types";
import { api } from "./api";
import { isMuted, listenForUnlock, playSound, setMuted } from "./board/audio";
import { Board, type BoardArrow, type BoardBadge } from "./board/Board";
import { EvalBar } from "./board/EvalBar";
import { capturedBy, capturedInPosition, materialBalance } from "./board/material";
import type { Premove } from "./board/placement";
import { PlayerBar } from "./board/PlayerBar";
import { lastMoveSound, stepSound } from "./board/sound";
import { MoveList } from "./components/MoveList";
import { MovePanel, START_INDEX } from "./components/MovePanel";
import { OpeningsCard } from "./components/OpeningsCard";
import { ReviewCard } from "./components/ReviewCard";
import { ModePicker, SetupCard } from "./components/SetupCard";
import { colorName, moveNumber, type PlayedMove, type Questions, type Settings } from "./game";
import { nextToGrade, scoreOf, type ReviewGame } from "./review";
import { activePath, addExchange, showVersion } from "./thread";

const START_FEN = new Chess().fen();
/** The id the starting position's questions go by; moves are numbered from 1. */
const START_ID = 0;
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

/** Moves from the starting position: an opening line's, as book moves, or a game's, to be graded. */
function lineMoves(sans: string[], ids: { current: number }, kind: "book" | "graded" = "book"): PlayedMove[] {
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
      graded: kind === "graded",
      book: kind === "book",
    };
  });
}

/** Ends a sentence that may not have a full stop, such as a PGN's Termination. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lastGradedIndex(moves: PlayedMove[]): number | null {
  for (let i = moves.length - 1; i >= 0; i--) if (moves[i].graded) return i;
  return null;
}

function sansOf(moves: PlayedMove[]): string[] {
  return moves.map((m) => m.san);
}

/** An explanation being played on the board. */
interface Walkthrough {
  /** The move explained or asked about, or START_ID for a question about the starting position. */
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

export function App({ user, onSignOut }: { user: SessionResponse; onSignOut: () => void }) {
  const [draft, setDraft] = useState<Settings>({ mode: "bot", myColor: "w", rating: 1000 });
  const [settings, setSettings] = useState<Settings>(draft);
  const [moves, setMoves] = useState<PlayedMove[]>([]);
  /**
   * Learning an opening or reviewing a game: the line's own moves (the opening's, or the game's),
   * kept while the move list branches off them so Back to the line can bring them back, with
   * their grades and explanations. Empty otherwise.
   */
  const [line, setLine] = useState<PlayedMove[]>([]);
  /** Number of moves shown on the board while stepping through the game; null follows the game. */
  const [viewPly, setViewPly] = useState<number | null>(null);
  /** The move picked in the list; at the end of the game the panel otherwise shows the last graded move. */
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [premoves, setPremoves] = useState<Premove[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [chosenModel, setChosenModel] = useState(loadModel);
  const [evals, setEvals] = useState<Record<string, PositionEval>>({});
  const [book, setBook] = useState<OpeningBook | null>(null);
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null);
  /** Questions about the starting position, which has no move to keep them. */
  const [startQuestions, setStartQuestions] = useState<Questions>({});
  /** Opening lines and book moves, loaded the first time you learn openings. */
  const [library, setLibrary] = useState<OpeningLibrary | null>(null);
  /** The opening line being learned. */
  const [study, setStudy] = useState<OpeningLine | null>(null);
  /** The book move under the pointer, with the position it was listed for. */
  const [bookHover, setBookHover] = useState<{ fen: string; uci: string } | null>(null);
  const [soundOn, setSoundOn] = useState(() => !isMuted());
  /** The game being reviewed; its moves are the line. */
  const [review, setReview] = useState<ReviewGame | null>(null);
  const [tabHidden, setTabHidden] = useState(() => document.hidden);
  /** Review grades waiting for the server, including ones for a game since replaced. */
  const reviewInFlight = useRef(0);
  /** Counts settled review grades, so the queue looks for the next move once one is free. */
  const [reviewSettled, setReviewSettled] = useState(0);
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
  const shownCount = live ? moves.length : viewPly!;
  const learning = settings.mode === "learn";
  const reviewed = settings.mode === "review" ? review : null;
  const reviewing = reviewed !== null;
  // Playing both sides you move every piece.
  const humanTurn = settings.mode === "both" || turn === settings.myColor;
  /** The bot's quiet moves, or the opponent's in a reviewed game, sound different from yours, as on chess.com. */
  const botColor: Color | null = settings.mode === "bot" || reviewing ? other(settings.myColor) : null;
  /**
   * Where the move list leaves the line: the first move that differs. Reviewing a game, moves
   * played on from its end leave it too.
   */
  const leftAt = learning
    ? study
      ? divergence(study.moves, sansOf(moves))
      : null
    : reviewing
      ? (divergence(sansOf(line), sansOf(moves)) ?? (moves.length > line.length ? line.length : null))
      : null;
  /** Reviewing a game grades the move list's moves, then the game's moves the list has left. */
  const reviewQueue = useMemo(() => {
    if (!reviewing) return [];
    const listed = new Set(moves.map((m) => m.id));
    return [...moves, ...line.filter((m) => !listed.has(m.id))];
  }, [reviewing, moves, line]);
  /** A move of the reviewed game couldn't be graded, so grading the rest waits for Resume. */
  const reviewStopped = reviewQueue.some((m) => m.gradeError);
  const canUseModel = (id: string) => user.vip || !isVipModel(id);
  const defaultModel = status?.coach.defaultModel ?? COACH_MODELS[0].id;
  const coachModel =
    chosenModel && COACH_MODELS.some((m) => m.id === chosenModel) && canUseModel(chosenModel)
      ? chosenModel
      : canUseModel(defaultModel)
        ? defaultModel
        : COACH_MODELS.find((m) => !m.vip)!.id;

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

  useEffect(() => listenForUnlock(), []);

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

  /** Changes a move wherever it is: in the move list, and in the line it may belong to. */
  const editMove = useCallback((id: number, change: (move: PlayedMove) => PlayedMove) => {
    const apply = (list: PlayedMove[]) => (list.some((m) => m.id === id) ? list.map((m) => (m.id === id ? change(m) : m)) : list);
    setMoves(apply);
    setLine(apply);
  }, []);

  const updateMove = useCallback(
    (id: number, patch: Partial<PlayedMove>) => editMove(id, (m) => ({ ...m, ...patch })),
    [editMove],
  );

  /** Changes the questions of a move, or of the starting position (START_ID). */
  const editQuestions = useCallback(
    (id: number, change: (questions: Questions) => Questions) => {
      if (id === START_ID) setStartQuestions(change);
      else editMove(id, (m) => ({ ...m, ...change(m) }));
    },
    [editMove],
  );

  /**
   * Grades a move; resolves to null if the engine fails, which the move then shows. With
   * `nextGraded`, the next move gets graded too (see api.grade).
   */
  const grade = useCallback(
    (move: PlayedMove, nextGraded = false): Promise<MoveGrade | null> => {
      updateMove(move.id, { grading: true, gradeError: undefined });
      return api.grade(move.fenBefore, move.uci, nextGraded).then(
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
      playSound(lastMoveSound([...moves.map((m) => m.uci), move.uci], botColor));
      // Playing both sides, the next move will be graded too.
      if (move.graded) grade(move, settings.mode === "both");
      return true;
    },
    [fen, moves, settings.mode, settings.myColor, botColor, grade],
  );

  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /** Moves graded at once while reviewing a game: as many as the server has grading engines (GRADING_ENGINES). */
  const reviewParallel = status?.engine.gradingEngines ?? 1;

  // Reviewing a game grades every move, reviewParallel at a time so the engine isn't swamped,
  // the one on the board first, then the rest of the move list and the game's moves it has
  // left. None start while the tab is hidden, and a failure stops the queue until Resume. Each
  // grade analyzes the position after its move the way the next grade needs, so the server's
  // cache answers that grade's first search.
  useEffect(() => {
    if (!reviewing || tabHidden || reviewStopped) return;
    for (const index of nextToGrade(reviewQueue, shownCount - 1, reviewParallel - reviewInFlight.current)) {
      const move = reviewQueue[index];
      const sequence = index < moves.length ? moves : line;
      const hasNext = sequence.findIndex((m) => m.id === move.id) < sequence.length - 1;
      reviewInFlight.current++;
      grade(move, hasNext).finally(() => {
        reviewInFlight.current--;
        setReviewSettled((n) => n + 1);
      });
    }
  }, [reviewing, tabHidden, reviewStopped, reviewQueue, moves, line, shownCount, grade, reviewSettled, reviewParallel]);

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
  const walkQuestions: Questions | undefined = walkthrough?.moveId === START_ID ? startQuestions : walkMove;
  const walkSteps =
    !walkthrough || !walkQuestions
      ? []
      : walkthrough.reply === null
        ? (walkMove?.explanation?.steps ?? [])
        : (activePath(walkQuestions.thread)[walkthrough.reply]?.exchange.reply.steps ?? []);
  const walkStep = walkthrough ? walkSteps[walkthrough.step] : undefined;

  // Plays the current step's moves one at a time, each with its sound.
  useEffect(() => {
    if (!walkthrough || !walkStep || walkthrough.played >= walkStep.moves.length) return;
    const timer = setTimeout(
      () => {
        const shown = walkStep.moves.slice(0, walkthrough.played + 1).map((m) => m.uci);
        playSound(lastMoveSound(shown, botColor, walkStep.fen));
        setWalkthrough((w) => w && { ...w, played: w.played + 1 });
      },
      walkthrough.played === 0 ? STEP_START_MS : STEP_MOVE_MS,
    );
    return () => clearTimeout(timer);
  }, [walkthrough, walkStep, botColor]);

  /** Plays a step of a move's explanation, or of one of its answers, on the board from its start. */
  const showStep = useCallback((moveId: number, step: number, reply: number | null = null) => {
    setWalkthrough({ moveId, reply, step, played: 0 });
    setPremoves([]);
  }, []);

  /**
   * Takes back the last `count` moves. Learning an opening or reviewing a game, when what's left
   * is on the line, the line's moves come back after it, and the board shows where you were.
   */
  const rewind = (count: number) => {
    gameToken.current++;
    const kept = moves.slice(0, moves.length - count);
    const backOnLine = (learning || reviewing) && kept.length < line.length && divergence(sansOf(line), sansOf(kept)) === null;
    setMoves(backOnLine ? [...kept, ...line.slice(kept.length)] : kept);
    setViewPly(backOnLine ? kept.length : null);
    setPremoves([]);
    setBotError(null);
    setWalkthrough(null);
  };

  /** Starts over with the given moves and line, from their first position when `atStart`. */
  const restart = (list: PlayedMove[], atStart: boolean) => {
    gameToken.current++;
    setMoves(list);
    setLine(list);
    setViewPly(atStart ? 0 : null);
    setPickedId(null);
    setPremoves([]);
    setFlipped(false);
    setBotError(null);
    setWalkthrough(null);
    setStartQuestions({});
  };

  const newGame = () => {
    setSettings(draft);
    setStudy(null);
    setReview(null);
    restart([], false);
  };

  /** Starts learning an opening line from its first position, with its moves ready to step through. */
  const startStudy = (studied: OpeningLine) => {
    setSettings({ ...draft, mode: "learn" });
    setStudy(studied);
    setReview(null);
    restart(lineMoves(studied.moves, nextId), true);
  };

  /**
   * Starts reviewing a game from its first position, with `myColor` (if known, otherwise the one
   * picked) at the bottom. Its moves are graded from there.
   */
  const startReview = (loaded: ReviewGame, myColor: Color | null) => {
    const next: Settings = { ...draft, mode: "review", myColor: myColor ?? draft.myColor };
    setDraft(next);
    setSettings(next);
    setReview(loaded);
    setStudy(null);
    restart(lineMoves(loaded.moves.map((m) => m.san), nextId, "graded"), true);
  };

  /** Clears the failures that stopped grading the reviewed game, so the queue tries those moves again. */
  const resumeReview = () => {
    for (const m of reviewQueue) if (m.gradeError) updateMove(m.id, { gradeError: undefined });
  };

  const changeDraft = (next: Settings) => {
    setDraft(next);
    // While learning an opening or reviewing a game, your color only turns the board and decides
    // whose moves are yours, so it applies at once.
    if (next.mode === settings.mode && (learning || reviewing)) setSettings((s) => ({ ...s, myColor: next.myColor }));
  };

  const retry = (index: number) => rewind(moves.length - index);

  // In bot mode, undo takes back the bot's reply together with your move, so it is your turn again.
  // Reviewing a game, only moves played off the game can be taken back.
  const canUndo =
    settings.mode === "bot"
      ? moves.some((m) => m.color === settings.myColor)
      : reviewing
        ? leftAt !== null && moves.length > leftAt
        : moves.length > 0;
  const undo = () => {
    if (!canUndo) return;
    const last = moves[moves.length - 1];
    rewind(settings.mode === "bot" && last.color !== settings.myColor ? 2 : 1);
  };

  /** Shows the position after `ply` moves; the last position resumes the game. */
  const goTo = useCallback(
    (ply: number) => {
      const clamped = Math.max(0, Math.min(moves.length, ply));
      playSound(stepSound(moves.map((m) => m.uci), shownCount, clamped, botColor));
      setViewPly(clamped >= moves.length ? null : clamped);
      setPickedId(null);
      if (clamped < moves.length) setPremoves([]);
      setWalkthrough(null);
    },
    [moves, shownCount, botColor],
  );

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
    if (!move || move.explaining || move.grading || move.asking) return;
    updateMove(move.id, { explaining: true, explainError: undefined });
    const perspective = move.color === settings.myColor ? "mine" : "opponent";
    const history = sansOf(moves.slice(0, index));
    const opening = openingContext(index);
    (move.grade ? Promise.resolve(move.grade) : grade(move))
      .then((g) => {
        if (!g) throw new Error("The move couldn't be analyzed.");
        return api.explain(g, history, coachModel, perspective, opening);
      })
      .then(
        (explanation) => {
          // Earlier questions were about the move without this explanation, or about an old one.
          updateMove(move.id, { explanation, explaining: false, thread: null, askError: undefined });
          if (explanation.steps.length > 0) showStep(move.id, 0);
        },
        (err: Error) => updateMove(move.id, { explaining: false, explainError: err.message }),
      );
  };

  /** Stops playing the answers from `depth` on, which are about to be hidden or replaced. */
  const stopAnswersFrom = (id: number, depth: number) => {
    setWalkthrough((w) => (w && w.moveId === id && w.reply !== null && w.reply >= depth ? null : w));
  };

  /**
   * Asks the coach about a move and the position after it (START_INDEX: the starting position),
   * whether or not the move was explained; a move not graded yet is graded first. With `depth`,
   * it replaces the question there, the way an edit does on claude.ai: the answer becomes a new
   * version of that question, and the old version keeps the questions that followed it. The
   * coach sees only the questions before it.
   */
  const ask = (index: number, question: string, depth?: number) => {
    const move = index === START_INDEX ? undefined : moves[index];
    const subject: Questions | undefined = index === START_INDEX ? startQuestions : move;
    if (!subject || subject.asking || move?.explaining || move?.grading) return;
    const id = move?.id ?? START_ID;
    const shown = activePath(subject.thread);
    const at = Math.min(depth ?? shown.length, shown.length);
    editQuestions(id, (q) => ({ ...q, asking: { question, depth: at }, askError: undefined }));
    stopAnswersFrom(id, at);
    const thread = shown
      .slice(0, at)
      .map(({ exchange: e }) => ({ question: e.question, answer: e.reply.answer, steps: e.reply.steps.map((s) => s.caption) }));
    const asked = move
      ? (move.grade ? Promise.resolve(move.grade) : grade(move)).then((g) => {
          if (!g) throw new Error("The move couldn't be analyzed.");
          const explanation = move.explanation;
          return api.ask({
            grade: g,
            history: sansOf(moves.slice(0, index)),
            model: coachModel,
            perspective: move.color === settings.myColor ? "mine" : "opponent",
            explanation: explanation && {
              summary: explanation.summary,
              steps: explanation.steps.map((s) => s.caption),
              lesson: explanation.lesson,
            },
            thread,
            question,
            opening: openingContext(index),
          });
        })
      : api.ask({
          fen: START_FEN,
          history: [],
          model: coachModel,
          // White moves first.
          perspective: settings.myColor === "w" ? "mine" : "opponent",
          thread,
          question,
          opening:
            learning && study && library
              ? {
                  studying: study.name,
                  reached: null,
                  bookMove: false,
                  bookMoves: library.next[positionKey(START_FEN)] ?? [],
                  line: study.moves,
                }
              : undefined,
        });
    asked.then(
      (reply) => {
        editQuestions(id, (q) => ({ ...q, asking: undefined, thread: addExchange(q.thread, at, { question, reply }) }));
        if (reply.steps.length > 0) showStep(id, 0, at);
      },
      (err: Error) => editQuestions(id, (q) => ({ ...q, asking: undefined, askError: err.message })),
    );
  };

  /** Shows another version of a question in a move's thread (or the starting position's), with the questions that followed it. */
  const showQuestionVersion = (index: number, depth: number, version: number) => {
    const subject: Questions | undefined = index === START_INDEX ? startQuestions : moves[index];
    const id = index === START_INDEX ? START_ID : moves[index]?.id;
    if (!subject?.thread || subject.asking || id === undefined) return;
    editQuestions(id, (q) => ({ ...q, thread: q.thread && showVersion(q.thread, depth, version), askError: undefined }));
    stopAnswersFrom(id, depth);
  };

  const chooseModel = (id: string) => {
    setChosenModel(id);
    try {
      localStorage.setItem(MODEL_KEY, id);
    } catch {
      // Storage unavailable: the choice lasts until the page reloads.
    }
  };

  /** Turns move sounds on or off; turning them on plays a move, so you hear the volume. */
  const toggleSound = () => {
    setMuted(soundOn);
    setSoundOn(!soundOn);
    if (!soundOn) playSound("move");
  };

  const displayFen = shownCount === 0 ? START_FEN : moves[shownCount - 1].fenAfter;
  const shownMove = shownCount > 0 ? moves[shownCount - 1] : null;
  /** Learning an opening or reviewing a game, the panel follows the board even through ungraded moves. */
  const followsBoard = learning || reviewing;
  const pickedIndex = pickedId === null ? -1 : moves.findIndex((m) => m.id === pickedId);
  const panelIndex: number | null = followsBoard
    ? shownCount > 0
      ? shownCount - 1
      : null
    : !live
      ? shownCount > 0
        ? shownCount - 1
        : null
      : pickedIndex >= 0
        ? pickedIndex
        : (lastGradedIndex(moves) ?? (moves.length > 0 ? moves.length - 1 : null));
  const panelMove = panelIndex === null ? undefined : moves[panelIndex];

  /**
   * Learning an opening or reviewing a game, you move from whatever position the board shows:
   * the next move in the list just steps forward, and any other move replaces the moves after
   * this point. Moves off the book are graded; reviewing a game, the grading queue takes them.
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
    const prefix = moves.slice(0, shownCount);
    // Playing the line's own move where the list left it goes back to the line, moves after it included.
    if (line[shownCount]?.uci === made.lan && divergence(sansOf(line), sansOf(prefix)) === null) {
      setMoves([...prefix, ...line.slice(shownCount)]);
      setViewPly(shownCount + 1);
      setPickedId(null);
      setWalkthrough(null);
      playSound(lastMoveSound([...prefix.map((m) => m.uci), made.lan], reviewing ? botColor : undefined));
      return true;
    }
    const inBook = learning && Boolean(library?.next[positionKey(displayFen)]?.includes(made.san));
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
    setMoves([...prefix, move]);
    setViewPly(null);
    setPickedId(null);
    setWalkthrough(null);
    playSound(lastMoveSound([...prefix.map((m) => m.uci), move.uci], reviewing ? botColor : undefined));
    if (move.graded && !reviewing) grade(move);
    return true;
  };

  /** Puts the line's moves back where you left it, keeping the moves before that, and shows that position. */
  const backToLine = () => {
    if (leftAt === null) return;
    setMoves([...moves.slice(0, leftAt), ...line.slice(leftAt)]);
    setViewPly(leftAt);
    setPickedId(null);
    setWalkthrough(null);
  };

  // Evaluation bar: reuse grades where possible, otherwise ask the engine once per position.
  const gradeEvals = useMemo(() => {
    const map = new Map<string, PositionEval>();
    for (const m of [...moves, ...line]) {
      if (!m.grade) continue;
      map.set(m.grade.fenBefore, m.grade.positionBefore);
      map.set(m.grade.fenAfter, m.grade.positionAfter);
    }
    return map;
  }, [moves, line]);
  const evaluation = gradeEvals.get(displayFen) ?? evals[displayFen] ?? null;
  // Reviewing a game, a move waiting in the grading queue will bring its positions' evaluations.
  const gradeComing = moves.some(
    (m) =>
      (m.grading || (reviewing && !reviewStopped && m.graded && !m.grade)) &&
      (m.fenAfter === displayFen || m.fenBefore === displayFen),
  );
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
  // Learning an opening or reviewing a game, the move's grade icon sits on its square, as in
  // chess.com's review: the same icons as the move list.
  const badgeKind = followsBoard && !walkView && shownMove ? (shownMove.grade?.classification ?? (shownMove.book ? "book" : null)) : null;
  const badge: BoardBadge | null = shownMove && badgeKind ? { square: toMove(shownMove.uci).to, kind: badgeKind } : null;

  // Learning an opening or reviewing a game, the side to move in the position shown may move,
  // wherever that is in the list.
  const movable: Color | null = followsBoard
    ? walkView
      ? null
      : (displayFen.split(" ")[1] as Color)
    : live && !walkView && !result && humanTurn && !botThinking
      ? turn
      : null;
  const premoveColor: Color | null =
    live && !walkView && !result && settings.mode === "bot" && turn !== settings.myColor ? settings.myColor : null;
  const botLabel = settings.rating === "max" ? "Maximum" : `${settings.rating}`;
  /** At the end of a reviewed game: how it ended, such as a resignation the board can't show. */
  const atReviewEnd = reviewed !== null && leftAt === null;
  const gameEnd = atReviewEnd && reviewed.termination ? sentence(reviewed.termination) : null;
  const endText = live ? (gameEnd ?? result) : null;

  const reviewedPlayer = (color: Color) => (reviewed ? reviewed[color === "w" ? "white" : "black"] : null);
  const playerName = (color: Color) =>
    reviewedPlayer(color)?.name ??
    (color === settings.myColor ? "You" : settings.mode === "bot" ? "Stockfish" : colorName(color));
  const playerBar = (color: Color) => {
    const mine = color === settings.myColor;
    const rating = reviewedPlayer(color)?.rating;
    const detail = reviewing
      ? rating
        ? `${rating}`
        : colorName(color)
      : mine
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

  const panelId = panelIndex === null ? START_ID : panelMove?.id;
  /** The move can be taken back to try another: off the book, off the reviewed game, or yours. */
  const retryable =
    panelMove !== undefined &&
    panelIndex !== null &&
    (learning
      ? !panelMove.book
      : reviewing
        ? leftAt !== null && panelIndex >= leftAt
        : panelMove.color === settings.myColor);
  const lastMove = moves[moves.length - 1];
  /** Playing on, the panel may show your graded move while the board has moved on to the reply. */
  const boardAhead = !followsBoard && live && lastMove && panelIndex !== moves.length - 1 ? moves.length - 1 : null;

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <img src="/pieces/staunty/wN.svg" alt="" aria-hidden /> ChessBuddy
        </h1>
        <div className="topbar-right">
          <StatusPills status={status} />
          <div className="account">
            <span title="Signed in">{user.username}</span>
            {user.vip && (
              <span className="vip" title="VIP account: every coach model, Opus included">
                VIP
              </span>
            )}
            <button onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="layout">
        <aside className="left-col" aria-label="Game details and the coach">
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
          {(draft.mode === "review" || reviewing) && (
            <ReviewCard
              game={reviewed}
              gameMoves={line}
              moves={moves}
              leftAt={leftAt}
              myColor={settings.myColor}
              stopped={reviewStopped}
              onLoad={startReview}
              onResume={resumeReview}
              onBackToGame={backToLine}
            />
          )}
          <MovePanel
            move={panelMove}
            index={panelIndex}
            start={startQuestions}
            myColor={settings.myColor}
            bothSides={settings.mode === "both" || reviewing}
            learning={learning}
            reviewing={reviewing}
            retryable={retryable}
            onBoard={followsBoard || (live ? panelIndex === moves.length - 1 : panelIndex === shownCount - 1)}
            coach={status?.coach ?? null}
            vip={user.vip}
            model={coachModel}
            onModelChange={chooseModel}
            onExplain={explain}
            onRetry={retry}
            onAnalyze={(i) => grade(moves[i])}
            onShowOnBoard={(i) => goTo(i + 1)}
            boardAhead={
              boardAhead === null ? null : { label: `${moveNumber(boardAhead)} ${moves[boardAhead].san}`, onPick: () => setPickedId(moves[boardAhead].id) }
            }
            active={
              walkthrough && walkthrough.moveId === panelId && walkStep
                ? { reply: walkthrough.reply, step: walkthrough.step }
                : null
            }
            onShowStep={(i, step, reply) => showStep(i === START_INDEX ? START_ID : moves[i].id, step, reply)}
            onAsk={ask}
            onShowVersion={showQuestionVersion}
          />
        </aside>

        <div className="board-dock">
          <section className="board-col">
            <div className="walk-strip">
              {walkthrough && walkStep && (
                <>
                  <span>
                    Explaining{" "}
                    <strong>{walkMove ? `${moveNumber(walkMoveIndex)} ${walkMove.san}` : "the starting position"}</strong> ·{" "}
                    {walkthrough.reply !== null && "answer · "}step {walkthrough.step + 1} of {walkSteps.length}
                  </span>
                  <button onClick={() => setWalkthrough(null)} title="Back to the game (Esc)">
                    <span aria-hidden>✕</span> Esc
                  </button>
                </>
              )}
            </div>
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
                  badge={badge}
                  onMove={(from, to, promotion) => (followsBoard ? explore : play)(`${from}${to}${promotion ?? ""}`)}
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
              <button
                className="sound-toggle"
                onClick={toggleSound}
                aria-pressed={soundOn}
                title={soundOn ? "Mute move sounds" : "Turn move sounds on"}
              >
                <SoundIcon on={soundOn} /> Sound
              </button>
              {/* In the controls' row, so the end of a game or an error doesn't move anything. */}
              <div className="board-status" role="status" title={botError ? `The bot couldn't move: ${botError}` : (endText ?? undefined)}>
                {botError ? (
                  <>
                    <span className="error-text">The bot couldn't move: {botError}</span>
                    <button onClick={() => setBotError(null)}>Try again</button>
                  </>
                ) : (
                  endText && <strong>{endText}</strong>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="right-col" aria-label="Mode and moves">
          <ModePicker draft={draft} onChange={changeDraft} />
          <MoveList
            moves={moves}
            current={shownCount - 1}
            opening={opening}
            white={playerName("w")}
            black={playerName("b")}
            score={atReviewEnd ? scoreOf(reviewed.result) : scoreText(game)}
            onSelect={(i) => {
              goTo(i + 1);
              setPickedId(moves[i].id);
            }}
            onFirst={() => goTo(0)}
            onPrevious={() => goTo(shownCount - 1)}
            onNext={() => goTo(shownCount + 1)}
            onLast={() => goTo(moves.length)}
          />
        </aside>
      </main>
    </div>
  );
}

/** A speaker, with sound waves when sound is on and crossed out when it is off. */
function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path className="speaker" d="M3 9.5h4l5-4v13l-5-4H3z" />
      <path d={on ? "M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" : "M16 9.5l5 5M21 9.5l-5 5"} />
    </svg>
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
