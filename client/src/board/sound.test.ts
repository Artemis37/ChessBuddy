import { describe, expect, it } from "vitest";
import { lastMoveSound, stepSound } from "./sound";

describe("lastMoveSound", () => {
  it("is a quiet move for a move that captures nothing", () => {
    expect(lastMoveSound(["e2e4"])).toBe("move");
  });

  it("sounds different for the opponent's quiet moves, but not for yours", () => {
    expect(lastMoveSound(["e2e4", "e7e5"], "b")).toBe("opponent");
    expect(lastMoveSound(["e2e4", "e7e5", "g1f3"], "b")).toBe("move");
  });

  it("is a capture for any capture, en passant too", () => {
    expect(lastMoveSound(["e2e4", "d7d5", "e4d5"])).toBe("capture");
    expect(lastMoveSound(["e2e4", "a7a6", "e4e5", "d7d5", "e5d6"])).toBe("capture");
  });

  it("is castling on either side", () => {
    expect(lastMoveSound(["e1g1"], null, "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")).toBe("castle");
    expect(lastMoveSound(["e8c8"], null, "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1")).toBe("castle");
  });

  it("is a promotion, even when the pawn captures to promote", () => {
    expect(lastMoveSound(["a7a8q"], null, "8/P6k/8/8/8/8/8/K7 w - - 0 1")).toBe("promote");
    expect(lastMoveSound(["a7b8q"], null, "1r6/P6k/8/8/8/8/8/K7 w - - 0 1")).toBe("promote");
  });

  it("is check when the move gives check, whatever else it does", () => {
    // 1.e4 e5 2.Bc4 Nc6 3.Bxf7+
    expect(lastMoveSound(["e2e4", "e7e5", "f1c4", "b8c6", "c4f7"])).toBe("check");
    // The bot's check is a check, not a quiet opponent move: 1.e4 e5 2.d4 Bb4+
    expect(lastMoveSound(["e2e4", "e7e5", "d2d4", "f8b4"], "b")).toBe("check");
  });

  it("is the end of the game on checkmate", () => {
    // Fool's mate: 1.f3 e5 2.g4 Qh4#
    expect(lastMoveSound(["f2f3", "e7e5", "g2g4", "d8h4"], "b")).toBe("gameEnd");
  });

  it("is the end of the game on stalemate", () => {
    expect(lastMoveSound(["f1f7"], null, "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1")).toBe("gameEnd");
  });

  it("is the end of the game when a capture leaves too little material to mate", () => {
    expect(lastMoveSound(["c1c2"], null, "8/8/8/8/8/8/2p5/2K4k w - - 0 1")).toBe("gameEnd");
  });

  it("counts the earlier moves for threefold repetition", () => {
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"];
    expect(lastMoveSound(shuffle.slice(0, 7))).toBe("move");
    expect(lastMoveSound(shuffle)).toBe("gameEnd");
  });

  it("is null without moves", () => {
    expect(lastMoveSound([])).toBeNull();
  });
});

describe("stepSound", () => {
  // 1.e4 d5 2.exd5 Qxd5
  const game = ["e2e4", "d7d5", "e4d5", "d8d5"];

  it("plays the move stepped to", () => {
    expect(stepSound(game, 2, 3)).toBe("capture");
    expect(stepSound(game, 0, 1, "b")).toBe("move");
    expect(stepSound(game, 1, 2, "b")).toBe("opponent");
  });

  it("plays the last move shown when jumping forward", () => {
    expect(stepSound(game, 0, 4)).toBe("capture");
  });

  it("plays a quiet move when going back", () => {
    expect(stepSound(game, 3, 2)).toBe("move");
    expect(stepSound(game, 4, 0)).toBe("move");
  });

  it("is silent when the position shown doesn't change", () => {
    expect(stepSound(game, 4, 4)).toBeNull();
  });
});
