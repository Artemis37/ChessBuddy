import { Chess, type PieceSymbol, type Square } from "chess.js";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { Color } from "../../../shared/types";
import { cellOf, displaySquares, isLightSquare, squareAtPoint } from "./geometry";

export interface BoardArrow {
  from: Square;
  to: Square;
  color: string;
}

interface Props {
  fen: string;
  orientation: Color;
  /** The color the user may move right now, or null when the board is read-only. */
  movable: Color | null;
  lastMove: { from: Square; to: Square } | null;
  /** Slide the last move's piece into place; set when a new move arrives from outside the board. */
  animateLastMove: boolean;
  arrows?: BoardArrow[];
  onMove: (from: Square, to: Square, promotion?: PieceSymbol) => boolean;
}

export function pieceUrl(color: Color, type: PieceSymbol): string {
  return `/pieces/staunty/${color}${type.toUpperCase()}.svg`;
}

/** Order of the promotion picker, nearest the promotion square first (as on chess.com). */
const PROMOTION_CHOICES: PieceSymbol[] = ["q", "n", "r", "b"];

interface Drag {
  from: Square;
  x: number;
  y: number;
  /** The piece was already selected, so releasing it in place deselects it. */
  deselectOnRelease: boolean;
}

/**
 * Chess board styled after chess.com. Pieces move by dragging or by clicking the piece and
 * then a target square; legal targets come from chess.js and are shown as dots, captures
 * as rings. Uses pointer events rather than HTML drag and drop, so there is no drag ghost.
 */
export function Board({ fen, orientation, movable, lastMove, animateLastMove, arrows = [], onMove }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; color: Color; dropped: boolean } | null>(
    null,
  );
  const [slide, setSlide] = useState<{ to: Square; dx: number; dy: number; key: string } | null>(null);
  /** The last move made by dropping a piece; it is already in place and needs no animation. */
  const dropped = useRef<string | null>(null);

  const chess = useMemo(() => new Chess(fen), [fen]);
  const squareSize = size / 8;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setSize(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelected(null);
    setDrag(null);
    setHover(null);
    setPromotion(null);
  }, [fen, movable, orientation]);

  useLayoutEffect(() => {
    if (!animateLastMove || !lastMove) {
      setSlide(null);
      return;
    }
    const key = `${lastMove.from}${lastMove.to}`;
    if (dropped.current === key) {
      dropped.current = null;
      setSlide(null);
      return;
    }
    const from = cellOf(lastMove.from, orientation);
    const to = cellOf(lastMove.to, orientation);
    setSlide({ to: lastMove.to, dx: (from.col - to.col) * 100, dy: (from.row - to.row) * 100, key: fen });
    // Only a new position starts an animation, so the other inputs are read but not watched.
  }, [fen]);

  const targets = useMemo(() => {
    if (!selected) return new Map<Square, boolean>();
    return new Map(chess.moves({ square: selected, verbose: true }).map((m) => [m.to as Square, Boolean(m.captured)]));
  }, [chess, selected]);

  function canPick(square: Square): boolean {
    const piece = chess.get(square);
    return Boolean(movable && piece && piece.color === movable && piece.color === chess.turn());
  }

  function pointIn(event: PointerEvent): { x: number; y: number } {
    const rect = ref.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function tryMove(from: Square, to: Square, wasDropped: boolean) {
    const piece = chess.get(from);
    if (piece?.type === "p" && (to[1] === "8" || to[1] === "1")) {
      setPromotion({ from, to, color: piece.color, dropped: wasDropped });
      return;
    }
    finishMove(from, to, wasDropped);
  }

  function finishMove(from: Square, to: Square, wasDropped: boolean, promotionPiece?: PieceSymbol) {
    dropped.current = wasDropped ? `${from}${to}` : null;
    if (!onMove(from, to, promotionPiece)) dropped.current = null;
    setSelected(null);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || promotion) return;
    const { x, y } = pointIn(event);
    const square = squareAtPoint(x, y, size, orientation);
    if (!square) return;

    if (selected && targets.has(square)) {
      tryMove(selected, square, false);
      return;
    }
    if (canPick(square)) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer was already released; the drag still works while it stays over the board.
      }
      setDrag({ from: square, x, y, deselectOnRelease: selected === square });
      setSelected(square);
      setHover(square);
      return;
    }
    setSelected(null);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const { x, y } = pointIn(event);
    setDrag({ ...drag, x, y });
    setHover(squareAtPoint(x, y, size, orientation));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const { x, y } = pointIn(event);
    const target = squareAtPoint(x, y, size, orientation);
    setDrag(null);
    setHover(null);
    if (target === drag.from) {
      if (drag.deselectOnRelease) setSelected(null);
    } else if (target && targets.has(target)) {
      tryMove(drag.from, target, true);
    } else {
      setSelected(null);
    }
  }

  const draggedPiece = drag ? chess.get(drag.from) : undefined;
  const boardStyle = { "--sq": `${squareSize}px` } as CSSProperties;

  return (
    <div
      ref={ref}
      className={`board ${drag ? "dragging" : ""}`}
      style={boardStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
        setHover(null);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {displaySquares(orientation).map((square) => {
        const { col, row } = cellOf(square, orientation);
        const piece = chess.get(square);
        const target = targets.get(square);
        const highlighted =
          square === selected || square === lastMove?.from || square === lastMove?.to || square === drag?.from;
        const sliding = slide?.to === square;
        const classes = [
          "sq",
          isLightSquare(square) ? "light" : "dark",
          highlighted ? "highlight" : "",
          drag && hover === square ? "hover" : "",
          canPick(square) ? "grab" : "",
        ];
        return (
          <div key={square} className={classes.join(" ")} data-square={square}>
            {col === 0 && <span className="coord rank">{square[1]}</span>}
            {row === 7 && <span className="coord file">{square[0]}</span>}
            {piece && drag?.from !== square && (
              <img
                key={sliding ? slide.key : square}
                className={`piece ${sliding ? "slide" : ""}`}
                src={pieceUrl(piece.color, piece.type)}
                style={sliding ? ({ "--dx": `${slide.dx}%`, "--dy": `${slide.dy}%` } as CSSProperties) : undefined}
                alt=""
                draggable={false}
              />
            )}
            {target !== undefined && <span className={target ? "hint capture" : "hint"} />}
          </div>
        );
      })}

      {arrows.length > 0 && (
        <svg className="arrows" viewBox="0 0 8 8">
          {arrows.map((arrow) => (
            <ArrowShape key={`${arrow.from}${arrow.to}${arrow.color}`} arrow={arrow} orientation={orientation} />
          ))}
        </svg>
      )}

      {drag && draggedPiece && (
        <img
          className="drag-piece"
          src={pieceUrl(draggedPiece.color, draggedPiece.type)}
          style={{ left: drag.x, top: drag.y }}
          alt=""
          draggable={false}
        />
      )}

      {promotion && (
        <PromotionPicker
          promotion={promotion}
          orientation={orientation}
          squareSize={squareSize}
          onPick={(piece) => {
            setPromotion(null);
            finishMove(promotion.from, promotion.to, promotion.dropped, piece);
          }}
          onCancel={() => {
            setPromotion(null);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function ArrowShape({ arrow, orientation }: { arrow: BoardArrow; orientation: Color }) {
  const from = cellOf(arrow.from, orientation);
  const to = cellOf(arrow.to, orientation);
  const [x1, y1, x2, y2] = [from.col + 0.5, from.row + 0.5, to.col + 0.5, to.row + 0.5];
  const length = Math.hypot(x2 - x1, y2 - y1);
  const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
  const head = 0.42;
  const [bx, by] = [x2 - ux * head, y2 - uy * head];
  const [px, py] = [-uy * 0.26, ux * 0.26];
  return (
    <g opacity={0.85}>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={arrow.color} strokeWidth={0.18} strokeLinecap="round" />
      <polygon points={`${x2},${y2} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={arrow.color} />
    </g>
  );
}

function PromotionPicker({
  promotion,
  orientation,
  squareSize,
  onPick,
  onCancel,
}: {
  promotion: { to: Square; color: Color };
  orientation: Color;
  squareSize: number;
  onPick: (piece: PieceSymbol) => void;
  onCancel: () => void;
}) {
  const { col, row } = cellOf(promotion.to, orientation);
  // The list grows from the promotion square toward the middle of the board.
  const fromTop = row === 0;
  const choices = fromTop ? PROMOTION_CHOICES : [...PROMOTION_CHOICES].reverse();
  return (
    <div
      className="promo-backdrop"
      onPointerDown={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="promo"
        style={{ left: col * squareSize, top: fromTop ? 0 : (row - 3) * squareSize }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {choices.map((piece) => (
          <button key={piece} aria-label={`Promote to ${piece}`} onClick={() => onPick(piece)}>
            <img src={pieceUrl(promotion.color, piece)} alt="" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  );
}
