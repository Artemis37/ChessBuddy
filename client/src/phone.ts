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
 * The phone layout's panels, left to right: the mode's own (the opening explorer, the game review
 * or the game's settings), the move list, and the coach.
 */
export const PANELS = ["main", "moves", "coach"] as const;
export type PanelId = (typeof PANELS)[number];
/** The two panels the toolbar's middle-left button switches between. */
export type SidePanel = Exclude<PanelId, "coach">;

export interface PanelState {
  current: PanelId;
  /** The last of the main and moves panels shown: closing the coach goes back to it. */
  side: SidePanel;
}

export function showPanel(state: PanelState, panel: PanelId): PanelState {
  return { current: panel, side: panel === "coach" ? state.side : panel };
}

/** The panel the Explorer/Moves button goes to, and names: the other of the two. */
export function otherSide(state: PanelState): SidePanel {
  return state.side === "main" ? "moves" : "main";
}

/** The coach button: opens the coach, or closes it and goes back to the panel before. */
export function toggleCoach(state: PanelState): PanelState {
  return showPanel(state, state.current === "coach" ? state.side : "coach");
}

/** How far a finger must move sideways to switch panels. */
const SWIPE_MIN = 50;

/**
 * The panel a swipe goes to: the next one for a swipe to the left, the previous one for a swipe
 * to the right. Null for a short or mostly vertical swipe, or past the first or last panel.
 */
export function swipeTarget(current: PanelId, dx: number, dy: number): PanelId | null {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 1.5 * Math.abs(dy)) return null;
  return PANELS[PANELS.indexOf(current) + (dx < 0 ? 1 : -1)] ?? null;
}
