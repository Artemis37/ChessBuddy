import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import {
  COACH_PANEL,
  MOVES_PANEL,
  otherSide,
  panelsOf,
  showPanel,
  startPanels,
  swipeTarget,
  toggleCoach,
  type PanelId,
} from "../phone";

/** One of the mode's own panels: the opening explorer, the game review or the game's settings. */
export interface MainPanel {
  id: PanelId;
  label: string;
  icon: "explorer" | "review" | "game" | "setup";
  content: ReactNode;
  /** What it shows, such as the opening line or the game: another one shows from the top. */
  subject?: unknown;
}

interface Props {
  /** The mode, named on the menu button; changing it shows its own panel (`start`). */
  mode: string;
  title: string;
  /** The menu's content, given a way to close it. */
  menu: (close: () => void) => ReactNode;
  /** The server, the engine or the coach isn't ready: the menu button shows a dot. */
  alert: boolean;
  /** Buttons on the right of the header, such as the sound. */
  tools: ReactNode;
  evalBar: ReactNode;
  /** The player bars above and below the board, or null to leave them out. */
  top: ReactNode;
  bottom: ReactNode;
  board: ReactNode;
  /** The line under the board: the opening's name, an explanation playing, the end of the game. */
  strip: ReactNode;
  /** The mode's own panels, first on the left: Analyze has Openings and Review, the other modes one. */
  mains: MainPanel[];
  /** Which of `mains` the mode starts on. */
  start: PanelId;
  /** One of `mains` has slid into view (Analyze follows the opening or the game it shows). */
  onMainShown?: (id: PanelId) => void;
  moves: ReactNode;
  coach: ReactNode;
  onFlip: () => void;
  onBack: () => void;
  onForward: () => void;
  canBack: boolean;
  canForward: boolean;
}

/**
 * The phone layout, after phone chess apps' analysis screen: the evaluation bar across the top,
 * the board, the opening's name, then a panel, and a toolbar at the bottom. The page never
 * scrolls; only the panel does. The panels sit side by side and slide: the mode's own (two in
 * Analyze: Openings and Review), the moves, and the coach, with a dot for each along the bottom.
 * The toolbar flips the board, switches between the mode's panel and the moves, opens the coach
 * (the big green button) and steps back and forward.
 */
export function PhoneLayout(props: Props) {
  const { mode, mains, start, onMainShown } = props;
  const mainIds = mains.map((m) => m.id);
  const panelIds = panelsOf(mainIds);
  const [panels, setPanels] = useState(() => startPanels(start));
  const [menuOpen, setMenuOpen] = useState(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
  // A mode's panels may differ from the last mode's: one left over shows the mode's first.
  const current = panelIds.includes(panels.current) ? panels : startPanels(start);
  const index = panelIds.indexOf(current.current);

  // Another mode starts on its own panel.
  useEffect(() => setPanels(startPanels(start)), [mode]);

  // Each of the mode's panels shows another subject (an opening line, a game) from the top.
  const subjects = mains.map((m) => m.subject);
  const seen = useRef<unknown[]>([]);
  useEffect(() => {
    subjects.forEach((subject, i) => {
      const page = pageRefs.current[i];
      if (page && seen.current[i] !== subject) page.scrollTop = 0;
    });
    seen.current = subjects;
  });

  // Panels slid out of view can't be reached with Tab or by a screen reader.
  useEffect(() => {
    pageRefs.current.forEach((page, i) => {
      if (page) page.inert = i !== index;
    });
  }, [index]);

  const go = (next: typeof current) => {
    setPanels(next);
    if (mainIds.includes(next.current)) onMainShown?.(next.current);
  };
  const show = (panel: PanelId) => go(showPanel(current, panel, mainIds));
  const side = otherSide(current, mainIds);
  const sideMain = mains.find((m) => m.id === side);
  const sideButton = sideMain ? { label: sideMain.label, icon: sideMain.icon } : { label: "Moves", icon: "moves" as const };

  const onTouchStart = (event: TouchEvent) => {
    const target = event.target as HTMLElement;
    const touch = event.touches[0];
    // Sliding a finger in a text box or a list picker selects text or values instead, and on the
    // set-up palette it drags a piece.
    swipe.current =
      event.touches.length === 1 && !target.closest("input, textarea, select, [data-no-swipe]")
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const from = swipe.current;
    swipe.current = null;
    const touch = event.changedTouches[0];
    if (!from || !touch) return;
    const target = swipeTarget(panelIds, current.current, touch.clientX - from.x, touch.clientY - from.y);
    if (target) show(target);
  };

  const pages: { id: PanelId; label: string; content: ReactNode }[] = [
    ...mains,
    { id: MOVES_PANEL, label: "Moves", content: props.moves },
    { id: COACH_PANEL, label: "Coach", content: props.coach },
  ];

  return (
    <div className={`app phone ${props.top ? "with-players" : ""}`}>
      <header className="m-header">
        <button className="m-menu-button" onClick={() => setMenuOpen(true)} aria-haspopup="dialog" aria-expanded={menuOpen}>
          <img src="/pieces/staunty/wN.svg" alt="" aria-hidden />
          <span className="m-title">{props.title}</span>
          <ToolIcon kind="down" />
          {props.alert && <span className="m-alert" aria-label="Something needs attention" />}
        </button>
        <div className="m-header-tools">{props.tools}</div>
      </header>

      <div className="m-stage">
        {props.evalBar}
        {props.top}
        <div className="m-board">{props.board}</div>
        {props.bottom}
      </div>

      <div className="m-strip">{props.strip}</div>

      <div className="m-panels" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="m-track" style={{ transform: `translateX(${-index * 100}%)` }}>
          {pages.map((page, i) => (
            <section
              key={page.id}
              ref={(element) => {
                pageRefs.current[i] = element;
              }}
              className={`m-page m-page-${page.id}`}
              aria-label={page.label}
            >
              {page.content}
            </section>
          ))}
        </div>
        {/* Over the panel's bottom edge, so they take no room of their own. */}
        <div className="m-dots" role="group" aria-label="Panels">
          {pages.map((page, i) => (
            <button
              key={page.id}
              className="m-dot"
              onClick={() => show(page.id)}
              aria-label={page.label}
              aria-current={i === index ? "true" : undefined}
              title={page.label}
            >
              <span aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <nav className="m-toolbar" aria-label="Board tools">
        <button className="m-tool" onClick={props.onFlip} title="Turn the board around">
          <ToolIcon kind="flip" />
          Flip
        </button>
        <button className="m-tool" onClick={() => show(side)}>
          <ToolIcon kind={sideButton.icon} />
          {sideButton.label}
        </button>
        <button
          className="m-coach"
          onClick={() => go(toggleCoach(current, mainIds))}
          aria-pressed={current.current === COACH_PANEL}
          aria-label="Coach"
          title="The coach: explain a move or ask about the position"
        >
          <ToolIcon kind="coach" />
        </button>
        <button className="m-tool" onClick={props.onBack} disabled={!props.canBack}>
          <ToolIcon kind="back" />
          Back
        </button>
        <button className="m-tool" onClick={props.onForward} disabled={!props.canForward}>
          <ToolIcon kind="forward" />
          Forward
        </button>
      </nav>

      {menuOpen && (
        <Sheet title="Menu" onClose={() => setMenuOpen(false)}>
          {props.menu(() => setMenuOpen(false))}
        </Sheet>
      )}
    </div>
  );
}

/** Scrolls the phone panel `element` is in back to its top, as when it shows something else. */
export function scrollPanelToTop(element: Element | null) {
  const page = element?.closest(".m-page");
  if (page) page.scrollTop = 0;
}

/** A panel that slides up from the bottom over the page, closed by its button, the backdrop or Esc. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="m-sheet-backdrop" onClick={onClose}>
      <div
        className="m-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="m-sheet-head">
          <h2>{title}</h2>
          <button className="m-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="m-sheet-body">{children}</div>
      </div>
    </div>
  );
}

type IconKind = MainPanel["icon"] | "moves" | "flip" | "coach" | "back" | "forward" | "down";

const ICON_PATHS: Record<IconKind, string> = {
  // An open book: the opening book.
  explorer: "M3 5.5h6a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H3zM21 5.5h-6a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H21z",
  // Bars: the review's accuracy and grades.
  review: "M5 20v-7M10 20V9M15 20v-5M20 20V4",
  // Sliders: the game's settings.
  game: "M4 7h9M17 7h3M15 4.5v5M4 17h3M11 17h9M9 14.5v5",
  // A board with two squares filled: setting up a position.
  setup: "M4 4h16v16H4zM4 12h16M12 4v16M6.5 6.5h3v3h-3zM14.5 14.5h3v3h-3z",
  moves: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  flip: "M8 20V4M4.5 7.5 8 4l3.5 3.5M16 4v16M12.5 16.5 16 20l3.5-3.5",
  // A speech bubble: ask the coach.
  coach: "M4 5h16v11H10l-5 4v-4H4zM8.5 9.5h7M8.5 12.5h4.5",
  back: "M15 5l-7 7 7 7",
  forward: "M9 5l7 7-7 7",
  down: "M7 10l5 5 5-5",
};

function ToolIcon({ kind }: { kind: IconKind }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`m-icon m-icon-${kind}`}>
      <path d={ICON_PATHS[kind]} />
    </svg>
  );
}
