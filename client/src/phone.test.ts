import { describe, expect, it } from "vitest";
import { otherSide, panelsOf, showPanel, showsPlayerBars, startPanels, swipeTarget, toggleCoach } from "./phone";

/** Playing the bot or both sides: one panel of the mode's own. */
const ONE = ["game"];
/** Analyze: Openings and Review. */
const TWO = ["openings", "review"];

describe("panelsOf", () => {
  it("puts the mode's own panels first, then the moves and the coach", () => {
    expect(panelsOf(ONE)).toEqual(["game", "moves", "coach"]);
    expect(panelsOf(TWO)).toEqual(["openings", "review", "moves", "coach"]);
  });
});

describe("the side button", () => {
  it("goes to the other of the mode's panel and the moves, and names it", () => {
    const start = startPanels("game");
    expect(otherSide(start, ONE)).toBe("moves");
    expect(otherSide(showPanel(start, "moves", ONE), ONE)).toBe("game");
  });

  it("from the coach, goes on from the panel before it", () => {
    const coach = toggleCoach(showPanel(startPanels("game"), "moves", ONE), ONE);
    expect(coach).toEqual({ current: "coach", side: "moves", main: "game" });
    expect(otherSide(coach, ONE)).toBe("game");
  });

  it("goes back from the moves to whichever of Analyze's two panels was shown last", () => {
    const onReview = showPanel(startPanels("openings"), "review", TWO);
    expect(otherSide(onReview, TWO)).toBe("moves");
    const onMoves = showPanel(onReview, "moves", TWO);
    expect(otherSide(onMoves, TWO)).toBe("review");
    expect(otherSide(toggleCoach(onMoves, TWO), TWO)).toBe("review");
  });
});

describe("toggleCoach", () => {
  it("opens the coach, then goes back to the panel before it", () => {
    const start = startPanels("openings");
    const coach = toggleCoach(start, TWO);
    expect(coach).toEqual({ current: "coach", side: "openings", main: "openings" });
    expect(toggleCoach(coach, TWO)).toEqual(start);
  });
});

describe("swipeTarget", () => {
  const panels = panelsOf(TWO);

  it("goes to the next panel for a swipe to the left and the previous one for a swipe to the right", () => {
    expect(swipeTarget(panels, "openings", -80, 10)).toBe("review");
    expect(swipeTarget(panels, "review", -80, 10)).toBe("moves");
    expect(swipeTarget(panels, "coach", 80, -10)).toBe("moves");
  });

  it("ignores short and mostly vertical swipes", () => {
    expect(swipeTarget(panels, "openings", -30, 0)).toBeNull();
    expect(swipeTarget(panels, "openings", -80, 70)).toBeNull();
  });

  it("stops at the first and last panels", () => {
    expect(swipeTarget(panels, "openings", 80, 0)).toBeNull();
    expect(swipeTarget(panels, "coach", -80, 0)).toBeNull();
  });
});

describe("showsPlayerBars", () => {
  it("shows them while playing, and in Analyze only with a game loaded, whichever panel shows", () => {
    expect(showsPlayerBars(false, false)).toBe(true);
    expect(showsPlayerBars(true, false)).toBe(false);
    expect(showsPlayerBars(true, true)).toBe(true);
  });
});
