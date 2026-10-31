import { describe, expect, it } from "vitest";
import { otherSide, showPanel, swipeTarget, toggleCoach, type PanelState } from "./phone";

const ON_MAIN: PanelState = { current: "main", side: "main" };

describe("the Explorer/Moves button", () => {
  it("goes to the other of the main and moves panels, and names it", () => {
    expect(otherSide(ON_MAIN)).toBe("moves");
    expect(otherSide(showPanel(ON_MAIN, "moves"))).toBe("main");
  });

  it("from the coach, goes on from the panel before it", () => {
    const coach = toggleCoach(showPanel(ON_MAIN, "moves"));
    expect(coach).toEqual({ current: "coach", side: "moves" });
    expect(otherSide(coach)).toBe("main");
  });
});

describe("toggleCoach", () => {
  it("opens the coach, then goes back to the panel before it", () => {
    const coach = toggleCoach(ON_MAIN);
    expect(coach).toEqual({ current: "coach", side: "main" });
    expect(toggleCoach(coach)).toEqual(ON_MAIN);
  });
});

describe("swipeTarget", () => {
  it("goes to the next panel for a swipe to the left and the previous one for a swipe to the right", () => {
    expect(swipeTarget("main", -80, 10)).toBe("moves");
    expect(swipeTarget("coach", 80, -10)).toBe("moves");
  });

  it("ignores short and mostly vertical swipes", () => {
    expect(swipeTarget("main", -30, 0)).toBeNull();
    expect(swipeTarget("main", -80, 70)).toBeNull();
  });

  it("stops at the first and last panels", () => {
    expect(swipeTarget("main", 80, 0)).toBeNull();
    expect(swipeTarget("coach", -80, 0)).toBeNull();
  });
});
