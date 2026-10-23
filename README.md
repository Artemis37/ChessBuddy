# ChessBuddy

A local chess learning app. Play Stockfish or play both sides yourself; every move of your color is graded by the engine, and an **Explain** button has Claude walk you through why the move was good or bad.

- **Play the bot**: pick your color and a bot rating from 400 to 2600 (an estimate on the Chess.com scale) or full-strength Stockfish. Your moves are graded automatically.
- **Play both sides**: you move both colors; the color you pick as "My color" is graded automatically.
- **Chess.com-style board**: drag a piece or click it and then a target square. Dots show where it can go, rings show captures, and the square you picked it up from turns yellow; the last move stays highlighted in yellow and every move slides into place. Player bars show captured pieces and the material lead (+1, +2, …), and an evaluation bar sits on the left. The board stays centered in the window while the side panel scrolls. **Flip board** turns the board around; **Undo** takes back your last move (and the bot's reply).
- **Premoves**: while the bot is thinking, move your pieces anyway; the premove squares turn red and the move is played the moment the bot has moved (several can be queued). An illegal premove is dropped, and right-clicking the board cancels them.
- **Move list like chess.com**: the opening name on top, then the moves in White and Black columns. Click a move, use the |< < > >| buttons, or the arrow keys (Home/End too) to see the position after any move; going forward to the last move lets you play on.
- **Move review**: grade (Best / Excellent / Good / Inaccuracy / Mistake / Blunder), evaluation and winning chances before and after, the engine's best move and line, the best reply, and facts such as hanging pieces, material lost, or missed mates. Click any move in the list to review it; for the other side's moves, **Analyze this move** grades it on request.
- **Explain this move**: Claude explains the move, yours or your opponent's, using only those engine facts, so it doesn't invent lines. Pick the model next to the button: Sonnet 5.5 (default), Opus 5.5 (most thorough) or Haiku 5.5 (fastest and cheapest).
- **Show on board** draws the move (orange) and the engine's best move (green). **Retry this move** takes the move back so you can find a better one.

## How it works

```
React (Vite) ──/api──► Node + Express ──MCP over stdio──► mcp-stockfish (Docker) ──► Stockfish 17
                              │
                              └──► Claude API (move explanations)
```

- `server/engine/mcpEngine.ts`: MCP client for [sonirico/mcp-stockfish](https://github.com/sonirico/mcp-stockfish), started with `docker run -i`. The server starts a fresh Stockfish for every tool call, so each call sends all its UCI commands at once (`setoption …`, `position …`, `go …`).
- Two engine connections (two containers) run side by side: one grades your moves, the other plays the bot's moves. mcp-stockfish answers one request at a time, so with a single connection the bot's reply would wait behind the grade.
- `server/analysis/`: grading. Winning chances use the Lichess formula; the grade comes from how much your winning chances dropped compared with the engine's best move (under 2 points is Excellent, under 5 Good, under 10 Inaccuracy, under 20 Mistake, 20 or more Blunder). The facts list (hanging pieces, material swings, mates) is computed with chess.js.
- `server/coach.ts`: one Claude call per Explain click with structured JSON output, using the model picked in the app.
- `client/src/board/`: the board, evaluation bar and player bars. Legal moves come from chess.js in the browser, so the dots appear instantly without asking the engine. The evaluation bar reuses grades where it can and otherwise asks `/api/eval`; the server caches analyses so the bar and grading don't search the same position twice.
- Pieces: the "Staunty" set by sadsnake1 from [Lichess](https://github.com/lichess-org/lila), licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (free for non-commercial use with credit). Chess.com's own pieces are their artwork and aren't used.
- Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0), kept in `data/openings/` and turned into `client/public/openings.json` by `npm run openings:build`. Openings are matched by position, so transpositions get the right name, and the last name stays once the game leaves the book.
- Premove targets follow how each piece moves (enemy pieces may still move out of the way, so only your own pieces block); the premove is checked against the real position when it's played.
- `server/bot/`: the bot's strength. Stockfish's own Elo setting is calibrated against engines, not people, and stops at 1320, so the bot weakens itself instead. It searches less deeply at lower ratings, picks randomly among the engine's top moves (worse moves get likelier as the rating drops), and at low ratings sometimes plays a random move, the way beginners hang pieces.

### Bot ratings are estimates

There's no official conversion from engine settings to Chess.com ratings. The strength table in `server/bot/strength.ts` is tuned so the bot's average centipawn loss (ACPL: how much it loses per move compared with the engine's best) matches rough figures for players at each rating, for example about 85 at 1000. Those target figures come from community reports, not a measured dataset, so treat a bot rating as roughly ±200.

To re-measure after changing the table (needs Docker; about 8 minutes with 12 workers):

```bash
npm run calibrate -- 150 2
```

[pab1it0/chess-mcp](https://github.com/pab1it0/chess-mcp) (Chess.com data) isn't used yet; it's planned for importing your Chess.com games in a later version.

## Setup

Requirements: Node 20.12+ and Docker Desktop (running).

```bash
npm install
npm run engine:build
```

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. Grading and the bot work without a key; only Explain needs it.

## Run

```bash
npm run dev
```

Open http://localhost:5173. The API runs on port 3001.

To run a production build on a single port instead:

```bash
npm run build
npm start
```

Then open http://localhost:3001.

## Settings (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Needed for Explain |
| `COACH_MODEL` | `claude-sonnet-5-5` | Default model for explanations (you can switch in the app) |
| `COACH_EFFORT` | `medium` | `low`, `medium` or `high`: more effort means deeper but slower explanations |
| `ANALYSIS_DEPTH` | `16` | Stockfish search depth used for grading |
| `STOCKFISH_IMAGE` | `chessbuddy/mcp-stockfish` | Docker image of the engine server |
| `API_PORT` | `3001` | API server port |
| `CALIBRATE_WORKERS` | `12` | Engine containers `npm run calibrate` runs at once |

## Tests

```bash
npm test
```
