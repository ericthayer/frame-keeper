# Frame Keeper

A 70s-alley bowling scorekeeper for league night. It scores 10-frame games, saves results to a shared history, and keeps leaderboards so everyone knows who has the bragging rights.

- **Live app:** https://frame-keeper.netlify.app (deploys from `main`)
- **Claude artifact:** https://claude.ai/artifact/17MNTmzKEhTmQsBReNbo1a

## Features

| Area | What it does |
| --- | --- |
| Scoring | Pin pad for 1–8 bowlers that only enables legal counts, tells a strike from a 10-count spare, and handles bonus balls in the 10th frame. Shows running totals and each bowler's best possible score. |
| Turn flow | Moves to the next bowler when a frame ends. Tap a name to change who's up, tap a finished frame to fix it, and Undo backs out the last ball or edit. |
| Game night | Autosaves the game in progress on the phone, keeps the screen awake, and plays marquee celebrations for strikes, spares, turkeys, gutters and 300 games (vibration where supported). |
| History | Shared match history with the full score sheet, Share (system share sheet or copy to clipboard), Rematch, and Delete with a confirm step. |
| Live lanes | On the Netlify site, the scorekeeper taps **Share live** to get a 4-letter lane code. Anyone can open `#watch-CODE`, or type the code on the Lanes screen, to follow the scoreboard on their own phone. It updates about every 2 seconds and shows the strike and spare celebrations too. Only the phone that started sharing can update its lane, and a lane expires after 12 hours. |
| Scan a scoreboard | Forgot to keep score? On the splash screen, snap the alley's score display. Claude Opus 5.5, running through Netlify AI Gateway (`/api/scan`), reads each bowler's marks. The app checks every frame against the bowling rules, adds up the totals itself, and compares them with the totals printed on the screen. You review the names, then load the game, and can tap any frame to fix it. |
| Update from a photo | Mid-game, tap **Snap the screen** to read the alley display and update the game in progress. Each row on the screen is matched to a bowler by name; you confirm the matches before anything changes. A bowler's frames are replaced only when the photo shows at least as many balls as the app has, so an old photo can't erase scores. Turn order picks up where the screen leaves off, and one Undo reverses the whole update. |
| Photos & send-off | After saving a game, add up to 8 photos (`/api/photos`, Netlify Blobs; shrunk on the phone first). Enter each bowler's email (remembered on that phone only) and tap **Email the results**: your mail app opens with the scores and a link (`#game-<id>`) to the score sheet and photos. **Share photos** sends the actual image files through the phone's share sheet where supported. |
| Leaderboard | Top 3 for **Pin Count**, **Games Won** and **Games Bowled**, plus High Game, Best Average, and a stat sheet for every bowler. Filter by all time, this year or the last 30 days. Tied scores share a rank, and a game needs 2+ bowlers to award a win. |

## Architecture

The app is plain JavaScript using Web Components and native ES modules, with no framework. The Claude artifact loads the modules unbundled; the Netlify build bundles them with esbuild into content-hashed files under `dist/assets/`. Types are checked by `tsc` through JSDoc (`checkJs`, `strict`).

```
app.html                 Page shell (published as-is to Claude; wrapped and bundled for Netlify by scripts/build.mjs)
src/scoring.js           Pure ten-pin scoring engine (unit tested)
src/stats.js             Saved-game model, validation, leaderboard aggregation
src/game.js              Live session: turn order, undo, frame edits, autosave
src/store.js             Storage adapters behind one interface
src/components/fk-*.js   <fk-scoreboard> <fk-pinpad> <fk-setup> <fk-leaderboard> <fk-history> <fk-celebrate>
netlify/functions/games.mts   GET/POST/DELETE /api/games on Netlify Blobs
netlify/functions/live.mts    GET/PUT/DELETE /api/live/:code (watch a game in progress)
src/live.js, src/live-ui.js   Live lane sharing (scorekeeper) and watching (everyone else)
netlify/functions/scan.mts    POST /api/scan (scoreboard photo → frames, via Netlify AI Gateway)
netlify/functions/photos.mts  POST/GET/DELETE /api/photos/:gameId[/:photoId]
```

### Where games are stored

`connectStore()` uses the first backend available:

1. **Claude artifact** → the artifact's shared `db` (collection `games`), with live updates.
2. **Netlify site** → `/api/games` (Netlify Function + Blobs store `games`). It re-polls every 20 seconds and when the tab regains focus. Deploy previews write to a separate store, so they can't touch real league data.
3. **Anywhere else** → `localStorage` on this device only.

The two shared histories are **separate**: games saved in the artifact don't appear on the Netlify site, and the reverse. Pick one as the league's home.

Each game is stored as frames (`number[][]`), not totals. Totals are recalculated on read, and the server checks every save with the same `parseGame()` validator the client uses.

## Art direction

70s bowling-alley colors (burnt orange, harvest gold, walnut) with mid-century matchbook-print treatments: original two-color SVG illustrations (`#art-*` symbols in `app.html`), paper grain, a halftone header, B·O·W·L diamonds, and a Yellowtail script for taglines.

## Develop

```sh
npm install
npm run check      # typecheck + scoring tests
npm run build      # dist/ for Netlify
npx netlify dev    # local run with the /api/games function
```

## Known trade-offs

- `/api/games` has no login. Anyone with the URL can add or delete games, limited to 60 requests per minute per IP. Put a shared PIN or Netlify Identity in front of it before posting the link publicly.
- Blobs is last-write-wins. That's fine here because each game is its own key, written once.
