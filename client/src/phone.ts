import { useEffect, useState } from "react";

/**
 * Where the phone layout takes over: windows narrower than the desktop's two columns need, and
 * phones held sideways. Tablets, and desktop windows from 760px wide, keep the desktop layout.
 */
export const PHONE_QUERY = "(max-width: 759px), (pointer: coarse) and (max-height: 500px)";

/** True while the window matches PHONE_QUERY. */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}

/**
 * A panel of the phone layout. Left to right: the mode's own (Analyze has two, Openings and
 * Review; the other modes one, the game's settings), then the move list and the coach.
 */
export type PanelId = string;
export const MOVES_PANEL = "moves";
export const COACH_PANEL = "coach";

/** Every panel, left to right, given the mode's own. */
export function panelsOf(mains: readonly PanelId[]): PanelId[] {
  return [...mains, MOVES_PANEL, COACH_PANEL];
}

export interface PanelState {
  current: PanelId;
  /** The last panel shown other than the coach: closing the coach goes back to it. */
  side: PanelId;
  /** The last of the mode's own panels shown: the side button goes back to it from the moves. */
  main: PanelId;
}

/** Showing the mode's panel `main`. */
export function startPanels(main: PanelId): PanelState {
  return { current: main, side: main, main };
}

export function showPanel(state: PanelState, panel: PanelId, mains: readonly PanelId[]): PanelState {
  return {
    current: panel,
    side: panel === COACH_PANEL ? state.side : panel,
    main: mains.includes(panel) ? panel : state.main,
  };
}

/**
 * The panel the toolbar's side button goes to, and names: the moves from the mode's own panels,
 * otherwise the last of the mode's own shown.
 */
export function otherSide(state: PanelState, mains: readonly PanelId[]): PanelId {
  return mains.includes(state.side) ? MOVES_PANEL : state.main;
}

/** The coach button: opens the coach, or closes it and goes back to the panel before. */
export function toggleCoach(state: PanelState, mains: readonly PanelId[]): PanelState {
  return showPanel(state, state.current === COACH_PANEL ? state.side : COACH_PANEL, mains);
}

/**
 * Whether the phone shows the players' bars above and below the board. Learning an opening
 * without a game, the board is all there is to it and the bars would take the explorer's room.
 * In Analyze they depend only on whether a game is loaded, never on the panel shown: sliding
 * between Openings and Review must not move the board.
 */
export function showsPlayerBars(analyzing: boolean, gameLoaded: boolean): boolean {
  return !analyzing || gameLoaded;
}

/** How far a finger must move sideways to switch panels. */
const SWIPE_MIN = 50;

/**
 * The panel a swipe goes to: the next one for a swipe to the left, the previous one for a swipe
 * to the right. Null for a short or mostly vertical swipe, or past the first or last panel.
 * The desktop's carousel uses it too.
 */
export function swipeTarget(panels: readonly PanelId[], current: PanelId, dx: number, dy: number): PanelId | null {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 1.5 * Math.abs(dy)) return null;
  return panels[panels.indexOf(current) + (dx < 0 ? 1 : -1)] ?? null;
}
