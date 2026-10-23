import { describe, expect, it } from "vitest";
import { cellOf, displaySquares, isLightSquare, squareAt, squareAtPoint } from "./geometry";

describe("squareAt / cellOf", () => {
  it("puts a8 top-left and h1 bottom-right for White", () => {
    expect(squareAt(0, 0, "w")).toBe("a8");
    expect(squareAt(7, 7, "w")).toBe("h1");
  });

  it("puts h1 top-left and a8 bottom-right for Black", () => {
    expect(squareAt(0, 0, "b")).toBe("h1");
    expect(squareAt(7, 7, "b")).toBe("a8");
  });

  it("round-trips every square in both orientations", () => {
    for (const orientation of ["w", "b"] as const) {
      for (const square of displaySquares(orientation)) {
        const { col, row } = cellOf(square, orientation);
        expect(squareAt(col, row, orientation)).toBe(square);
      }
    }
  });
});

describe("squareAtPoint", () => {
  it("finds the square under a point", () => {
    expect(squareAtPoint(10, 790, 800, "w")).toBe("a1");
    expect(squareAtPoint(450, 450, 800, "w")).toBe("e4");
    expect(squareAtPoint(450, 450, 800, "b")).toBe("d5");
  });

  it("returns null off the board", () => {
    expect(squareAtPoint(-1, 10, 800, "w")).toBeNull();
    expect(squareAtPoint(10, 800, 800, "w")).toBeNull();
  });
});

describe("isLightSquare", () => {
  it("matches the real board colors", () => {
    expect(isLightSquare("a1")).toBe(false);
    expect(isLightSquare("h1")).toBe(true);
    expect(isLightSquare("e4")).toBe(true);
    expect(isLightSquare("d4")).toBe(false);
  });
});
