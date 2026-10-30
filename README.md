# ChessBuddy

A local chess learning app. Play Stockfish or play both sides yourself, or bring in one of your Chess.com games; the engine grades your moves (every move when you play both sides or review a game), and an **Explain** button has Claude walk you through why the move was good or bad.

- **Play the bot**: pick your color and a bot rating from 400 to 2600 (an estimate on the Chess.com scale) or full-strength Stockfish. Your moves are graded automatically.
- **Play both sides**: you move both colors and every move, White's and Black's, is graded automatically, with Chess.com's icon for it (a star for Best, a thumbs-up for Excellent, a check for Good, ?! Inaccuracy, ? Mistake, ?? Blunder) in the move list. "My color" sits at the bottom of the board, and explanations treat the other color as your opponent.
- **Learn openings**: pick an opening (Sicilian, Scandinavian, French, … 150 of them, searchable) and then one of its variations. Its moves load into the move list: step through them with → or the move buttons. You can move pieces at any point: the line's next move just steps forward, and any other move branches off from there. A card lists the book moves in the position on the board, with the variation each one leads to, and **Back to the line** returns to where you left it (so does playing the line's own move there). Moves off the book are graded; book moves show a book icon, in the move list and on the board, and once one is graded (explaining it grades it) its grade icon too. With `LICHESS_TOKEN` set, each book move also shows how often it's played: its share of the Lichess opening explorer's rated blitz and rapid games in that position, among players of the rating you pick (labelled with the approximate Chess.com rating, from under 400 to 2650+). The most played come first, moves outside the book that at least 2% of those games went on with follow under **Also played here**, and a chart below shows how the move under the pointer (or the line's move) is played from one rating to the next, with how its games ended. **Explain this move** works on any move: Claude explains it as opening theory (the idea, the plan, what to watch for) and plays the line you're learning on the board, and you can ask follow-up questions.
- **Review a game**: type your Chess.com username (it isn't stored) and **Show games** lists your recent games, newest first, with **Older games** to go further back. Or paste the game's PGN (Chess.com → Share → PGN), or a game link (`https://www.chess.com/game/live/…`) together with the username of either player: Chess.com's public API can't look a game up by its link, so the link is matched among that player's games of the last 12 months (see [How it works](#how-it-works)). The game loads into the move list with your side at the bottom, and every move of both sides is graded, `GRADING_ENGINES` at a time (one by default) and the move on the board first; grading pauses while the tab is in the background. A summary card counts each side's grades and gives each side's accuracy, by Lichess's published formula (Chess.com's own is private), with Chess.com's figure next to it when the game was reviewed there. Step through the game as usual; **Explain this move** and questions work on any move. At any point you can play moves for either side, as in Learn openings: they branch off from the move on the board and are graded, and **Back to the game** (or playing the game's own move there) puts the game's moves back, with their grades and explanations. Moves you played can be retried or undone; the game's own can't. The game's opening moves, up to the first one the opening book doesn't list, show the book icon next to their grade, as on Chess.com. With a game loaded, the **Learn openings** tab studies its opening: the move list and the position on the board stay, and the line is the one the game's moves reach (the opening named above the move list, in the game's move order), with the book moves card, the explorer's numbers and opening-aware explanations. Grading goes on meanwhile, and the **Review a game** tab brings the review back, grades and all; moves you played while learning become a branch off the game there. Chess960 and other variants, and games from a set-up position, are refused.
- **Grades on the board**: in Learn openings and Review a game, the move on the board shows its grade icon (Chess.com's own, the same as in the move list, or the book) on the top-right corner of the square its piece moved to (a graded book move shows the book icon to its left), and the move's two squares take the grade's color instead of yellow, as in chess.com's review.
- **Chess.com-style board**: drag a piece or click it and then a target square. Dots show where it can go, rings show captures, and the square you picked it up from turns yellow; the last move stays highlighted in yellow and every move slides into place. Player bars show captured pieces and the material lead (+1, +2, …), and an evaluation bar sits on the left. **Flip board** turns the board around; **Undo** takes back your last move (and the bot's reply).
- **Arrows and squares**: in every mode, drag with the right mouse button to draw an arrow (knight moves get an L-shaped one) and right-click a square to color it red. As on chess.com, Shift makes them green, Ctrl red (an orange square) and Alt blue; drawing the same arrow or square again removes it. A left click on the board, or a new position, clears them.
- **Premoves**: while the bot is thinking, move your pieces anyway; the premove squares turn red and the move is played the moment the bot has moved (several can be queued). An illegal premove is dropped, and while premoves are queued a right-click on the board cancels them.
- **Layout**: the mode and the move list sit right of the board, everything else (settings, the opening or game card, the move review with its explanation and questions) on the left. Each side column scrolls on its own and the page itself doesn't scroll, so stepping through the moves never moves the board or the move buttons, however long an explanation is. In a narrower window the mode and moves sit above the coach's panel next to the board; on a phone the board comes first, then the moves and the mode, then the coach's panel in a scroll area of its own.
- **Sound**: every move makes a sound, as on chess.com. Quiet moves, captures, castling, check, promotion and the end of the game each have their own, and the bot's quiet moves sound a little deeper than yours. Stepping through the move list and the moves of an explanation play them too. **Sound** under the board mutes them, and the app remembers the choice.
- **Move list like chess.com**: the opening name on top, then the moves in White and Black columns. Click a move, use the |< < > >| buttons, or the arrow keys (Home/End too) to see the position after any move; going forward to the last move lets you play on.
- **Move review**: grade (Best / Excellent / Good / Inaccuracy / Mistake / Blunder), evaluation and winning chances before and after, the engine's best move and line, the best reply, and facts such as hanging pieces, material lost, or missed mates. Click any move in the list to review it; for the other side's moves, **Analyze this move** grades it on request.
- **Explain this move**: Claude explains the move, yours or your opponent's, in one sentence and two to four short steps that play out on the board: the move and what it neglects or threatens, the reply that punishes it (or how to answer it), and the better move. Each step slides its moves into place, then draws arrows for attacks and outlines squares such as a hanging piece, and the evaluation bar follows along. Click a step, use ◀ ⟲ ▶ or the arrow keys to move between steps, and press Esc to go back to the game. Pick the model next to the button: Sonnet 5.5 (default), Opus 5.5 (most thorough, VIP accounts only) or Haiku 5.5 (fastest and cheapest).
- **Ask the coach**: the move review always has a question box, in every mode, with or without an explanation: ask about the move on the board and the position after it ("What should I play now?", "Why not 3... Qf6?"), or about the starting position before any move. A move that isn't graded yet is graded first. In Play the bot, when the review shows your move but the board has moved on to the bot's reply, a link switches to that reply so you can ask about the position now. The answer is a sentence or two plus steps that play the moves it talks about, including moves the engine didn't suggest: Claude has Stockfish play them and continue with best play. Questions build on the earlier ones, and on the explanation if there is one; **Explain this move** starts a fresh thread. As on claude.ai, **✎ Edit** changes an earlier question and **↻ Retry** asks it again for another answer. Each makes a new version of that question, and the coach sees only the questions before it. The old version keeps the questions that followed it, and **‹ 1 / 2 ›** switches between versions.
- **Retry this move** takes the move back so you can find a better one.
- **Sign-in**: ChessBuddy is a private system. There's no sign-up: the owner account `kviiilyn37_` is built in, and other accounts are added in the database (see [Accounts](#accounts)). A session lasts 7 days or until you press **Sign out**.
- **VIP accounts**: only VIP accounts may use Opus 5.5; for other accounts it's disabled in the model picker and the server refuses it. Haiku and Sonnet are open to everyone. The owner is VIP.

## How it works

```
React (Vite) ──/api──► Node + Express ──MCP over stdio──► mcp-stockfish (Docker) ──► Stockfish 17
  │                      │    │          (or MCP over HTTP, ENGINE_URL, to the engine container's gateway)
  │                      │    └──► Claude API (move explanations)
  │                      ├──► explorer.lichess.org (how often moves are played, with LICHESS_TOKEN)
  │                      └──► Azure SQL (accounts, only when someone signs in)
  └──► api.chess.com (your games, for Review a game; straight from the browser)
```

- `server/engine/mcpEngine.ts`: MCP client for [sonirico/mcp-stockfish](https://github.com/sonirico/mcp-stockfish). Locally it's started with `docker run -i`; when `ENGINE_URL` is set, the client talks MCP over HTTP to the engine container instead (`docker/gateway/server.mjs`, see [Deploy](#deploy)). The server starts a fresh Stockfish for every tool call, so each call sends all its UCI commands at once (`setoption …`, `position …`, `go …`).
- Engine connections run side by side: `GRADING_ENGINES` of them (1 by default) grade moves, and one more plays the bot's moves. mcp-stockfish answers one request at a time, so with a single connection the bot's reply would wait behind the grade. `server/engine/pool.ts` hands each grading search to a free grading connection and queues the rest, so that many searches run at once. Locally each connection is its own container; the HTTP engine container runs a pool of `ENGINE_POOL_SIZE` (default 2) mcp-stockfish processes and hands each request to a free one, so more grading connections than that start another engine replica.
- `server/auth/`: sign-in. Passwords are stored as scrypt hashes. The owner account `kviiilyn37_` never touches the database: its password is checked against `OWNER_PASSWORD_HASH`, or the default hash in `server/auth/users.ts` when that isn't set, and any database row with that name is ignored. Other accounts live in Azure SQL (`chessbuddy.Users`, created on the first sign-in that looks an account up) when `SQL_CONNECTION_STRING` is set; otherwise only the owner exists. Sessions are HMAC-signed, HttpOnly cookies that carry the account's VIP flag, so checking a session or its VIP flag never touches the database and a free-tier database can stay paused while you play; a change to an account applies from its next sign-in. `/api/explain` and `/api/ask` refuse VIP-only models (Opus) to other accounts with a 403. Five failed sign-ins from one address block it for 15 minutes. Every `/api` route except `/api/auth/*` and `/api/health` needs a session.
- `server/analysis/`: grading. Winning chances use the Lichess formula; the grade comes from how much your winning chances dropped compared with the engine's best move (under 2 points is Excellent, under 5 Good, under 10 Inaccuracy, under 20 Mistake, 20 or more Blunder). The facts list (hanging pieces, material swings, mates) is computed with chess.js.
- `server/coach.ts`: one Claude call per Explain click with structured JSON output, using the model picked in the app. Claude never writes the moves the board plays: for each step it only picks one of the engine's lines (the move played followed by the best reply, or one of the engine's top three moves) and which of its moves to show. `server/analysis/walkthrough.ts` turns that into real moves and keeps only the arrows chess.js confirms in that position, so the board shows lines the engine actually found. To show a move that isn't in those lines, Claude calls a `try_moves` tool: the server plays the moves (rejecting illegal ones) and asks Stockfish for the best continuation, which becomes a new line the steps can use. When a caption names a move that comes shortly after the step's last move in its line, the step plays up to it, so moves mentioned in the text are also shown. Questions (`/api/ask`) go through the same tool loop, with the move's facts, its explanation if there is one, and earlier questions replayed as context. A question about the starting position sends the position instead of a move's grade, and the server gives the coach the engine's three best lines there.
- `client/src/board/`: the board, evaluation bar and player bars. Legal moves come from chess.js in the browser, so the dots appear instantly without asking the engine. The evaluation bar reuses grades where it can and otherwise asks `/api/eval`; the server caches analyses so the bar and grading don't search the same position twice.
- `client/src/chesscom.ts`: Chess.com's public [Published-Data API](https://www.chess.com/news/view/published-data-api) (no sign-in): the archive list, then one monthly archive at a time, newest first. It allows requests from any page, so the browser calls `api.chess.com` itself, one request at a time as Chess.com asks, and the ChessBuddy server never contacts Chess.com: no server route, container or database use. There's no lookup by game ID, so a pasted link is matched against the `url` of the games in a player's archives, and needs either player's username. Chess.com's unofficial `www.chess.com/callback/live/game/<id>`, which names the players, can't fill in: it sends no CORS header, so the browser may not read it, and Cloudflare refuses it to clients that aren't browsers, such as the server. `shared/pgn.ts` reads the PGN with chess.js (clock comments and side lines are skipped) and refuses variants and set-up positions, and `shared/accuracy.ts` computes the summary's accuracy.
- Reviewing a game, `client/src/review.ts` picks the moves to grade, as many at a time as the server has grading engines (`/api/status` reports `GRADING_ENGINES`).
- When the next move will be graded too (playing both sides, or reviewing a game), `/api/grade` is sent with `nextGraded`: the position after the move is analyzed with the three lines the next move's grade needs, and the analysis cache answers that grade, so each position is searched once.
- Pieces: the "Staunty" set by sadsnake1 from [Lichess](https://github.com/lichess-org/lila), licensed [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) (free for non-commercial use with credit). Chess.com's own pieces are their artwork and aren't used.
- Grade icons: chess.com's own move-classification icons (`classification-<grade>.svg` from `www.chess.com/bundles/web/images/color-icons/`), kept unchanged in `client/public/grades/` and shown by `GradeIcon` in `client/src/components/icons.tsx`. The grade colors in `client/src/styles.css` are chess.com's too (its `--color-classification-*`). Like the sounds, the icons are chess.com's assets and aren't licensed for reuse; they're here for personal use.
- Sounds: chess.com's own sound files (`move-self`, `move-opponent`, `capture`, `castle`, `move-check`, `promote` and `game-end`, from `images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/`), kept in `data/sounds/`. They're chess.com's assets and aren't licensed for reuse; they're here for personal use. `npm run sounds:build` turns them into data URLs in `client/src/board/sounds.json`, which is bundled into the app's JavaScript: the page never requests an `.mp3`, because download managers such as IDM take over those requests and the page never gets the sound. `client/src/board/audio.ts` plays them with the Web Audio API and synthesizes any sound whose file doesn't decode. `client/src/board/sound.ts` picks a move's sound from its chess.js flags and the position after it. Browsers only allow sound once you've interacted with the page, so a move before your first click or key press is silent.
- Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) (CC0), kept in `data/openings/` and turned into `client/public/openings.json` by `npm run openings:build`. Openings are matched by position, so transpositions get the right name, and the last name stays once the game leaves the book. The same script writes `client/public/opening-lines.json` (every named line, and the book moves from each position on them, also keyed by position), which the app loads the first time you open **Learn openings** or **Review a game**. When you explain a move there, the coach gets the opening's name, whether the move is in the book, the book's moves in that position and a "book" board line: the next moves of the line you're learning.
- `server/explorer.ts`: how often moves are played, from the [Lichess opening explorer](https://lichess.org/api#tag/Opening-Explorer) at `explorer.lichess.org`, which has only answered signed-in accounts since March 2026. The server sends `LICHESS_TOKEN` (a personal token, no scopes), so the token never reaches the browser, through `POST /api/explorer`. The explorer groups games by the players' average rating (under 1000, 1000, 1200, … 2200, 2500 and up), one request per group, and `shared/explorer.ts` labels each group with the matching Chess.com ratings from [ChessGoals' comparison](https://chessgoals.com/rating-comparison/) of players active on both sites: Lichess runs about 500 points higher at the bottom, and the two meet around 2200. Lichess allows 20 requests a minute, one at a time. The server sends them one by one, waits once 20 went out in the last minute, pauses a minute after a 429, and sends the band on screen before the background requests that fill in the chart, which may use only 12 of the 20, so stepping through a line always has room. The client asks for the other bands only once a position has stayed on screen for 1.5 seconds, one at a time and nearest first, and cancels what's left when you move to another position. A new position's numbers usually arrive in under a second; past 20 new positions in a minute, the caption says it's waiting for Lichess's limit. Answers are kept in the server's memory (lost when the app scales to zero) and in the browser's localStorage for 30 days; nothing goes to the database.
- Premove targets follow how each piece moves (enemy pieces may still move out of the way, so only your own pieces block); the premove is checked against the real position when it's played.
- `server/bot/`: the bot's strength. Stockfish's own Elo setting is calibrated against engines, not people, and stops at 1320, so the bot weakens itself instead. It searches less deeply at lower ratings, picks randomly among the engine's top moves (worse moves get likelier as the rating drops), and at low ratings sometimes plays a random move, the way beginners hang pieces.

### Bot ratings are estimates

There's no official conversion from engine settings to Chess.com ratings. The strength table in `server/bot/strength.ts` is tuned so the bot's average centipawn loss (ACPL: how much it loses per move compared with the engine's best) matches rough figures for players at each rating, for example about 85 at 1000. Those target figures come from community reports, not a measured dataset, so treat a bot rating as roughly ±200.

To re-measure after changing the table (needs Docker; about 8 minutes with 12 workers):

```bash
npm run calibrate -- 150 2
```

[pab1it0/chess-mcp](https://github.com/pab1it0/chess-mcp) (Chess.com data) isn't used: it wraps the same public API in a separate MCP server, which would need another process or container, while the browser can call the API directly.

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

Open http://localhost:5173 and sign in with the owner account (username `kviiilyn37_`; only its password's hash is in `server/auth/users.ts`, or in `OWNER_PASSWORD_HASH`). The API runs on port 3001.

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
| `LICHESS_TOKEN` | none | A Lichess personal token (sign in to Lichess, then [lichess.org/account/oauth/token](https://lichess.org/account/oauth/token), no scopes) for the opening explorer: Learn openings then shows how often each move is played. Without it the percentages are hidden |
| `ANALYSIS_DEPTH` | `16` | Stockfish search depth used for grading |
| `GRADING_ENGINES` | `1` | Engines that grade moves at once, 1 to 8; reviewing a game grades that many moves at a time. Locally each is its own Docker container (plus one for the bot); behind `ENGINE_URL`, each is one of the engine container's processes. Anything else falls back to 1 with a warning |
| `STOCKFISH_IMAGE` | `chessbuddy/mcp-stockfish` | Docker image of the engine server (when `ENGINE_URL` isn't set) |
| `ENGINE_URL` | none | MCP endpoint of the HTTP engine container, for example `http://localhost:8080/mcp`. When set, the server doesn't start Docker containers |
| `ENGINE_TOKEN` | none | Sent as `Authorization: Bearer …` to `ENGINE_URL`; must match the engine container's `ENGINE_TOKEN` |
| `SESSION_SECRET` | random at startup | Signs session cookies. Set it in production, or every restart signs you out |
| `SQL_CONNECTION_STRING` | none | Azure SQL connection string for accounts other than the owner. Without it, only the owner exists |
| `OWNER_PASSWORD_HASH` | the hash in `server/auth/users.ts` | The owner's password hash, from `npm run password:hash`. The repo is public, so set a strong password this way instead of in the code. The server refuses to start if it isn't such a hash |
| `API_PORT` | `3001` | API server port |
| `CALIBRATE_WORKERS` | `12` | Engine containers `npm run calibrate` runs at once |

The HTTP engine container (`npm run engine:build:http`) reads `PORT` (default `8080`), `ENGINE_POOL_SIZE` (default `2`, mcp-stockfish processes per container) and `ENGINE_TOKEN` (optional; when set, requests need it).

## Accounts

The owner `kviiilyn37_` is VIP and isn't stored in the database. To change its password, make a hash and set it as `OWNER_PASSWORD_HASH` (in `.env` locally, as a Container Apps secret in production; [docs/deploy-aca.html](docs/deploy-aca.html) step 10):

```bash
npm run password:hash -- "<new password>"
```

Other accounts live in Azure SQL. To add one, make its password's hash the same way, put the username and the hash at the bottom of [scripts/add-user.sql](scripts/add-user.sql), and run the whole script in the portal's Query editor (**SQL database → Query editor**) or any SQL client. It creates the `chessbuddy` schema and the `Users` table if they're missing, adds the `IsVip` column to a table made before it existed, and inserts the account with `IsVip = 0`. The server runs the same setup on the first sign-in that looks an account up. To make an account VIP, set its `IsVip` to 1; changes apply from the account's next sign-in.

## Deploy

[docs/deploy-aca.html](docs/deploy-aca.html) walks through deploying to Azure Container Apps on the free monthly grant: two images (`Dockerfile` for the web app, the `http` target of `docker/mcp-stockfish.Dockerfile` for the engine), the engine reachable only from inside the environment, and accounts in an Azure SQL free-tier database.

GitHub Actions (`.github/workflows/ci.yml`) typechecks and tests every push and pull request, then builds both images. Pushes to `master` publish them to Docker Hub as `<user>/chessbuddy-web` and `<user>/chessbuddy-engine`, tagged `sha-<commit>` and `latest` (a `v1.2.0` git tag also publishes `1.2.0`); pull requests only build them. It needs a `DOCKERHUB_USERNAME` variable and a `DOCKERHUB_TOKEN` secret (a Read & Write Docker Hub token) in the repo's **Settings → Secrets and variables → Actions**. Once the `ACA_RESOURCE_GROUP` variable and the `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` secrets are set, a third job deploys each push to `master`: it signs in to Azure with a federated credential (no stored password), points `chessbuddy-engine` and then `chessbuddy-web` at the new `sha-…` tag, and waits until `/api/health` (public; it returns the commit the web image was built from) reports the new commit. Step 9 of the guide sets this up.

To try the two containers together locally:

```bash
npm run engine:build:http
```

```bash
npm run web:build
```

## Tests

```bash
npm test
```
