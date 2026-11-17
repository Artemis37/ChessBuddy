import type { PieceSymbol } from "chess.js";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import type { Color } from "../../../shared/types";
import { pieceUrl } from "../board/Board";
import { colorName } from "../game";
import { castlingOf, possibleCastling, turnOf, type CastlingRight, type SetupPiece } from "../setup";

/** What a press on the board does while setting up: put this piece there, or take one off. */
export type PaletteTool = SetupPiece | "eraser";

interface Props {
  /** Setting up a position is on; otherwise the card offers to start it. */
  active: boolean;
  /** The position on the board. */
  fen: string;
  /** What stops the position from being played, if anything. */
  problem: string | null;
  /** Things a real game can't reach, which don't stop play. */
  notes: string[];
  /** Giving the move to the other side fixes the problem. */
  turnFixes: boolean;
  /** An explanation is playing on the board: edits wait until it's closed. */
  locked: boolean;
  editMode: boolean;
  onEditMode: (on: boolean) => void;
  tool: PaletteTool | null;
  onTool: (tool: PaletteTool | null) => void;
  /** A palette piece dropped at a point on the page: the board puts it on the square there. */
  onDropPiece: (piece: SetupPiece, x: number, y: number) => void;
  onTurn: (color: Color) => void;
  onCastling: (right: CastlingRight, on: boolean) => void;
  onClear: () => void;
  onStartPosition: () => void;
  /** Loads a pasted FEN; resolves to what's wrong with it, or null. */
  onLoadFen: (text: string) => string | null;
  /** Starts setting up, from the position on the board or the usual starting position. */
  onStart: (from: "board" | "start") => void;
  compact?: boolean;
}

const TYPES: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];
const PIECE_NAMES: Record<PieceSymbol, string> = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const CASTLING_LABELS: { right: CastlingRight; label: string }[] = [
  { right: "K", label: "White O-O" },
  { right: "Q", label: "White O-O-O" },
  { right: "k", label: "Black O-O" },
  { right: "q", label: "Black O-O-O" },
];
/** How far a press on a palette piece must move to become a drag rather than picking it. */
const DRAG_MIN = 6;

function sameTool(a: PaletteTool | null, b: PaletteTool): boolean {
  if (a === "eraser" || b === "eraser") return a === b;
  return a !== null && a.color === b.color && a.type === b.type;
}

/**
 * Setting up a position: the pieces to put on the board (drag one there, or pick it and press
 * squares), the eraser, Edit (pieces on the board go anywhere), the side to move, castling,
 * Clear, the starting position, and the position as FEN to copy or paste.
 */
export function PositionCard(props: Props) {
  const { active, fen, problem, notes, locked, compact } = props;
  if (!active) {
    return (
      <section className={`card position ${compact ? "compact" : ""}`}>
        <h2>Set up a position</h2>
        <p className="muted small">
          Start from the position on the board or the usual starting position, then drag pieces on and off the board,
          pick who moves, and play.
        </p>
        <div className="actions">
          <button className="primary" onClick={() => props.onStart("board")}>
            Use the board's position
          </button>
          <button onClick={() => props.onStart("start")}>Starting position</button>
        </div>
      </section>
    );
  }

  const turn = turnOf(fen);
  const rights = castlingOf(fen);
  const possible = possibleCastling(fen);
  return (
    <section className={`card position ${compact ? "compact" : ""}`}>
      <div className="openings-head">
        <h2>Position</h2>
        <button
          className={`edit-toggle ${props.editMode ? "on" : ""}`}
          aria-pressed={props.editMode}
          onClick={() => props.onEditMode(!props.editMode)}
          disabled={locked}
          title={props.editMode ? "Pieces on the board move as in a game again" : "Move pieces on the board anywhere, without the rules"}
        >
          ✎ Edit
        </button>
      </div>

      <Palette tool={props.tool} onTool={props.onTool} onDrop={props.onDropPiece} disabled={locked} />
      <p className="muted small palette-help">
        {props.tool
          ? props.tool === "eraser"
            ? "Press pieces on the board to take them off. Press the eraser again to stop."
            : `Press squares to put a ${colorName(props.tool.color).toLowerCase()} ${PIECE_NAMES[props.tool.type]} there. Press it again to stop.`
          : props.editMode
            ? "Drag pieces on the board anywhere, or off it to take them away."
            : "Drag a piece onto the board, or one off it to take it away. Moves on the board are played as usual."}
      </p>

      {/* One line, always there, so a problem coming or going moves nothing. */}
      <div className={`position-status ${problem ? "bad" : ""}`} role="status">
        {problem ? (
          <>
            <span title={problem}>{problem}</span>
            {props.turnFixes && (
              <button onClick={() => props.onTurn(turn === "w" ? "b" : "w")} disabled={locked}>
                Give {colorName(turn === "w" ? "b" : "w")} the move
              </button>
            )}
          </>
        ) : (
          <span title={notes.join(" ")}>{notes[0] ?? `${colorName(turn)} to move.`}</span>
        )}
      </div>

      <div className="segmented turn-pick" role="radiogroup" aria-label="Side to move">
        {(["w", "b"] as const).map((color) => (
          <button
            key={color}
            role="radio"
            aria-checked={turn === color}
            className={turn === color ? "on" : ""}
            onClick={() => turn !== color && props.onTurn(color)}
            disabled={locked}
          >
            {colorName(color)} to move
          </button>
        ))}
      </div>

      <fieldset className="castling" disabled={locked}>
        <legend>Castling</legend>
        {CASTLING_LABELS.map(({ right, label }) => (
          <label key={right} className={possible.includes(right) ? "" : "muted"} title={possible.includes(right) ? undefined : "Needs the king and that rook on their starting squares"}>
            <input
              type="checkbox"
              checked={rights.includes(right)}
              disabled={!possible.includes(right)}
              onChange={(e) => props.onCastling(right, e.target.checked)}
            />{" "}
            {label}
          </label>
        ))}
      </fieldset>

      <div className="actions">
        <button onClick={props.onClear} disabled={locked}>
          Clear board
        </button>
        <button onClick={props.onStartPosition} disabled={locked}>
          Starting position
        </button>
      </div>

      <FenBox fen={fen} onLoad={props.onLoadFen} disabled={locked} />
    </section>
  );
}

/**
 * The pieces to put on the board, White's and Black's, and the eraser. Dragging a piece onto the
 * board puts it there; pressing it picks it, so pressing squares puts it on them.
 */
function Palette({
  tool,
  onTool,
  onDrop,
  disabled,
}: {
  tool: PaletteTool | null;
  onTool: (tool: PaletteTool | null) => void;
  onDrop: (piece: SetupPiece, x: number, y: number) => void;
  disabled: boolean;
}) {
  const [ghost, setGhost] = useState<{ piece: SetupPiece; x: number; y: number } | null>(null);
  const press = useRef<{ piece: SetupPiece; x: number; y: number; dragging: boolean } | null>(null);
  /** When a drag last ended: the click the browser sends right after it mustn't pick the piece too. */
  const draggedAt = useRef(0);

  const pick = (choice: PaletteTool) => onTool(sameTool(tool, choice) ? null : choice);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>, piece: SetupPiece) => {
    if (disabled || event.button !== 0) return;
    draggedAt.current = 0;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Released already: the press works as a click.
    }
    press.current = { piece, x: event.clientX, y: event.clientY, dragging: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = press.current;
    if (!current) return;
    if (!current.dragging && Math.hypot(event.clientX - current.x, event.clientY - current.y) < DRAG_MIN) return;
    current.dragging = true;
    setGhost({ piece: current.piece, x: event.clientX, y: event.clientY });
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = press.current;
    press.current = null;
    setGhost(null);
    if (current?.dragging) {
      draggedAt.current = Date.now();
      onDrop(current.piece, event.clientX, event.clientY);
    }
  };
  const onPointerCancel = () => {
    press.current = null;
    setGhost(null);
  };

  return (
    // data-no-swipe: dragging a piece sideways mustn't slide the phone's panel or the carousel.
    <div className="palette" data-no-swipe role="group" aria-label="Pieces to put on the board">
      {(["w", "b"] as const).map((color) => (
        <div className="palette-row" key={color}>
          {TYPES.map((type) => {
            const piece = { color, type };
            const on = sameTool(tool, piece);
            return (
              <button
                key={type}
                className={`palette-piece ${on ? "on" : ""}`}
                aria-pressed={on}
                aria-label={`${colorName(color)} ${PIECE_NAMES[type]}`}
                title={`${colorName(color)} ${PIECE_NAMES[type]}: drag it onto the board, or press it and then squares`}
                disabled={disabled}
                onPointerDown={(e) => onPointerDown(e, piece)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onClick={() => {
                  if (Date.now() - draggedAt.current > 500) pick(piece);
                  draggedAt.current = 0;
                }}
              >
                <img src={pieceUrl(color, type)} alt="" draggable={false} />
              </button>
            );
          })}
          {color === "w" ? (
            <button
              className={`palette-piece eraser ${tool === "eraser" ? "on" : ""}`}
              aria-pressed={tool === "eraser"}
              aria-label="Eraser"
              title="Eraser: press it, then pieces on the board to take them off"
              disabled={disabled}
              onClick={() => pick("eraser")}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H8l-2.5-2.5a1.4 1.4 0 0 1 0-2z" />
                <path d="M9.5 10.5l5 5" />
              </svg>
            </button>
          ) : (
            <span className="palette-gap" aria-hidden />
          )}
        </div>
      ))}
      {ghost &&
        createPortal(
          <img
            className="palette-ghost"
            src={pieceUrl(ghost.piece.color, ghost.piece.type)}
            style={{ left: ghost.x, top: ghost.y }}
            alt=""
            draggable={false}
          />,
          document.body,
        )}
    </div>
  );
}

/** The position as FEN, to copy, and a box to paste one into. */
function FenBox({ fen, onLoad, disabled }: { fen: string; onLoad: (text: string) => string | null; disabled: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputId = useId();
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    navigator.clipboard?.writeText(fen).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1500);
      },
      () => setError("Couldn't copy: select the FEN and copy it instead."),
    );
  };

  return (
    <div className="fen-box">
      <h3>FEN</h3>
      <div className="fen-row">
        <code className="fen" title={fen}>
          {fen}
        </code>
        <button onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <form
        className="fen-row"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = onLoad(text);
          setError(problem);
          if (!problem) setText("");
        }}
      >
        <label className="sr-only" htmlFor={inputId}>
          Paste a FEN
        </label>
        <input
          id={inputId}
          className="search"
          value={text}
          spellCheck={false}
          autoComplete="off"
          placeholder="Paste a FEN to set it up"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={disabled || !text.trim()}>
          Load
        </button>
      </form>
      {error && <p className="error-text small">{error}</p>}
    </div>
  );
}
