import { describe, expect, it } from "vitest";
import { isStartPosition, PgnError, readPgn } from "./pgn";

/** Shaped like Chess.com's Share → PGN, clock comments included. */
const CHESS_COM_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2026.09.30"]
[Round "-"]
[White "kviiilyn37_"]
[Black "opponent99"]
[Result "1-0"]
[CurrentPosition "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4"]
[Timezone "UTC"]
[ECO "C23"]
[UTCDate "2026.09.30"]
[UTCTime "22:58:09"]
[WhiteElo "1012"]
[BlackElo "987"]
[TimeControl "180+2"]
[Termination "kviiilyn37_ won by checkmate"]
[Link "https://www.chess.com/game/live/184627853334"]

1. e4 {[%clk 0:03:00]} 1... e5 {[%clk 0:03:00]} 2. Bc4 {[%clk 0:02:59.4]} 2... Nc6 {[%clk 0:02:58.1]} 3. Qh5 {[%clk 0:02:57]} 3... Nf6 {[%clk 0:02:50.2]} 4. Qxf7# {[%clk 0:02:55.9]} 1-0
`;

describe("readPgn", () => {
  it("reads a Chess.com PGN with clock comments", () => {
    const game = readPgn(CHESS_COM_PGN);
    expect(game.moves.map((m) => m.san)).toEqual(["e4", "e5", "Bc4", "Nc6", "Qh5", "Nf6", "Qxf7#"]);
    expect(game.moves[0]).toEqual({ san: "e4", uci: "e2e4" });
    expect(game.moves[6].uci).toBe("h5f7");
    expect(game.headers).toMatchObject({
      White: "kviiilyn37_",
      Black: "opponent99",
      Result: "1-0",
      WhiteElo: "1012",
      Termination: "kviiilyn37_ won by checkmate",
      Link: "https://www.chess.com/game/live/184627853334",
    });
  });

  it("leaves out chess.js's placeholder tags", () => {
    const { headers } = readPgn("1. e4 e5 2. Nf3 *");
    expect(headers).toEqual({ Result: "*" });
  });

  it("follows the main line past side lines, annotations and Windows line breaks", () => {
    const game = readPgn('[Event "x"]\r\n\r\n1. e4 $1 e5 (1... c5 2. Nf3) 2. Nf3 {A comment} Nc6 *\r\n');
    expect(game.moves.map((m) => m.san)).toEqual(["e4", "e5", "Nf3", "Nc6"]);
  });

  it("reads only the first of several games", () => {
    const game = readPgn(`${CHESS_COM_PGN}\n[Event "Live Chess"]\n[Result "0-1"]\n\n1. d4 d5 0-1\n`);
    expect(game.moves).toHaveLength(7);
    expect(game.headers.Result).toBe("1-0");
  });

  it("reads a game whose moves have no tags", () => {
    expect(readPgn("1. d4 d5 2. c4").moves.map((m) => m.san)).toEqual(["d4", "d5", "c4"]);
  });

  it("rejects Chess960 and other variants", () => {
    const chess960 = `[Event "Live Chess 960"]\n[Variant "Chess960"]\n[SetUp "1"]\n[FEN "bnrkrqnb/pppppppp/8/8/8/8/PPPPPPPP/BNRKRQNB w KQkq - 0 1"]\n\n1. e4 e5 *`;
    expect(() => readPgn(chess960)).toThrow(new PgnError("Chess960 games can't be reviewed, only standard chess."));
    expect(() => readPgn(`[Variant "Crazyhouse"]\n\n1. e4 e5 *`)).toThrow(/Crazyhouse games can't be reviewed/);
  });

  it("accepts a Variant tag that means standard chess", () => {
    expect(readPgn(`[Variant "Standard"]\n\n1. e4 *`).moves).toHaveLength(1);
  });

  it("rejects a game from a set-up position but accepts the standard one written out", () => {
    const setUp = `[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 *`;
    expect(() => readPgn(setUp)).toThrow(/starts from a set-up position/);
    const standard = `[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n1. e4 *`;
    expect(readPgn(standard).moves).toHaveLength(1);
  });

  it("explains PGNs it can't read", () => {
    expect(() => readPgn("")).toThrow(new PgnError("Paste a game's PGN first."));
    expect(() => readPgn(`[Event "x"]\n\n*`)).toThrow(new PgnError("This game has no moves to review."));
    expect(() => readPgn("1. e4 e5 2. Ke3 *")).toThrow(/^That isn't a PGN ChessBuddy can read \(Invalid move in PGN: Ke3\)\.$/);
    expect(() => readPgn("hello there")).toThrow(PgnError);
  });
});

describe("isStartPosition", () => {
  it("ignores the move counters", () => {
    expect(isStartPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBe(true);
    expect(isStartPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 3 7")).toBe(true);
    expect(isStartPosition("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1")).toBe(false);
  });
});
