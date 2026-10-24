# PRD: Usability pass after the first league night

Status: tracking

## Architecture Overview

```
  ┌──────────── phone (scorekeeper / watchers) ─────────────┐
  │  app shell (main.js)                                    │
  │   ├─ <fk-scoreboard>  ← totals, rows, frame buttons     │
  │   ├─ <fk-pinpad>      ← keys + typed marks              │
  │   ├─ final card       ← save / rematch / end game       │
  │   ├─ <fk-history>, <fk-leaderboard>, <fk-watch>         │
  │   └─ service worker   ← offline shell cache (new)       │
  └───────────────┬─────────────────────────────────────────┘
                  │ /api/games  /api/live  /api/scan  /api/photos
                  ▼
        ┌──────────────────────┐      ┌──────────────────────┐
        │ Netlify Functions    │─────▶│ Netlify Blobs        │
        └──────────────────────┘      └──────────────────────┘
  build: scripts/build.mjs → dist/ (bundled, hashed assets + manifest + sw)
  Claude artifact: app.html + unbundled src/ (unchanged path)
```

## Problem Statement

The group used Frame Keeper live for a league night and a usability audit of the live site found
problems that cost them scores and time. An unsaved finished game can be wiped by one tap on
Rematch. Bowler totals sit off-screen on a phone. With a full lane of five or six bowlers, the
pinned pin pad hides the rows of whoever is up. Every refresh at the alley re-downloads about 20
files, there is no home-screen install, and the app is blank without signal. Some orange text
fails contrast, the header badge forces sideways scrolling on small or zoomed screens, frame
buttons are mislabelled for voice control, games from the same night look identical in History,
keyboard users can't cancel a frame fix with Escape, the watch screen polls a dead lane every two
seconds forever, and landscape hides the scoreboard behind the pad.

## Solution

Guard every path that could discard a finished game, keep totals and the active bowler in view,
make the app installable and fast to load with offline support, fix the contrast and reflow
failures, label frame buttons with what they show, date-and-time History cards, add Escape and a
skip link for keyboard users, back off dead-lane polling, and lay the pad beside the board in
landscape. The established 70s visual design stays; the only visual changes are the darker
accessible orange and the landscape layout, both approved.

## User Stories

1. As a scorekeeper finishing a game, I want no single tap to throw away an unsaved game, so that
   a forgetful moment never costs the night's scores.
   - AC1: an unsaved finished game's final card offers "Save to history" and "Save & rematch",
     and no control on the card starts a new game without saving.
   - AC2: "Save & rematch" sends exactly one POST /api/games containing the finished game's frames,
     then starts a new game with the same bowlers in the same order at frame 1.
   - AC3: if that save fails, no new game starts, the finished game stays on screen, and an error
     message is shown in the final card's status line.
   - AC4: once the game is saved, the final card offers "Rematch", which starts the new game
     immediately with the same bowlers.
   - AC5: the End game confirmation says unsaved scores will be lost only for an unsaved game; for
     a saved game it says the game is safe in History.

2. As a bowler watching the scoreboard on a phone, I want every total visible without scrolling
   sideways, so that I always know the score.
   - AC1: at 390px wide during a game, every bowler's Total cell lies fully inside the viewport,
     including after the frames scroll horizontally to frame 10.
   - AC2: at 390px wide, the Total cells of an expanded History score sheet lie fully inside the
     viewport.

3. As a scorekeeper with a full lane of bowlers, I want whoever is up to stay visible above the
   pin pad, so that I'm never entering balls for a row I can't see.
   - AC1: at 375x667 with 6 bowlers, after each turn change the active bowler's row lies fully
     between the top of the viewport and the top of the pin pad.
   - AC2: with 5 or more bowlers, every row except the active bowler's is at most 40px tall and
     still shows that bowler's name and total; the active row keeps full height.
   - AC3: with 4 or fewer bowlers, all rows keep full height.

4. As a bowler on a small or zoomed phone, I want no sideways scrolling, so that the page fits my
   screen.
   - AC1: at 320px wide, the splash, game, Leaders and History screens have a document
     scrollWidth no greater than the viewport width.
   - AC2: at 390px wide with the root font size set to 200%, the splash and game screens have a
     document scrollWidth no greater than the viewport width.

5. As a voice-control or screen-reader user, I want frame buttons named by what they show, so
   that I can say what I see.
   - AC1: each scoreboard frame button's accessible name contains its visible marks and its
     visible running total.
   - AC2: axe reports no label-content-name-mismatch violations on the game and final screens.

6. As a bowler browsing History, I want to tell games from the same night apart, so that I can
   find the one I'm looking for.
   - AC1: each History card shows the time the game was saved (e.g. "8:19 PM") next to its date.
   - AC2: when more than one game was saved on the same calendar day, each of those cards shows
     "Game N" for that day, numbered in the order played (earliest is Game 1).

7. As a keyboard user, I want to cancel a frame fix and reach the pin pad quickly, so that I can
   score without a mouse or touch.
   - AC1: pressing Escape while fixing a frame cancels the fix: the edit banner hides and the
     frames are unchanged.
   - AC2: after a frame fix is cancelled (Escape or the Cancel button), keyboard focus is on the
     scoreboard frame button that was being fixed.
   - AC3: during a game, a "Skip to pin pad" link is the first focusable element in the Lanes
     view, and activating it moves focus to the typed-marks box.

8. As a watcher following a lane that has ended, I want the app to stop hammering the server, so
   that my battery and the site's function budget are spared.
   - AC1: after GET /api/live/<code> answers 404, the watch screen makes no more than one request
     per 10 seconds until a request returns 200.
   - AC2: once a request returns 200, polling returns to every 2 seconds.

9. As a bowler at an alley with weak signal, I want the app to load fast, install to my home
   screen and keep working offline, so that a bad connection doesn't stop scoring.
   - AC1: the production build (dist/) loads the app's JavaScript from at most 2 script files and
     its CSS from at most 1 stylesheet, each with a content hash in its filename, and dist/
     index.html references only those hashed files.
   - AC2: netlify.toml sets `Cache-Control: public, max-age=31536000, immutable` for the hashed
     asset path and `public, max-age=0, must-revalidate` for HTML.
   - AC3: dist/index.html links a web app manifest declaring name "Frame Keeper", display
     "standalone", a theme color and 192px and 512px PNG icons that exist in dist/, plus an
     apple-touch-icon link to an existing PNG.
   - AC4: after one online visit, reloading with the network offline still shows the splash, and
     a game in progress is still on screen.
   - AC5: requests to /api/* are never answered from the offline cache.
   - AC6: app.html (the Claude artifact page) still loads the unbundled ES modules from src/.

10. As a bowler with low vision, I want all text to meet contrast minimums, so that I can read
    every heading and score.
    - AC1: axe reports no color-contrast violations on the splash, setup, game, final, Leaders and
      History screens, in both light and dark themes.

11. As a scorekeeper holding the phone sideways, I want the scoreboard and pin pad on screen
    together, so that landscape is usable.
    - AC1: at 667x375 during a game, after the sheet scrolls into view, the active bowler's row
      and all 12 pin keys are fully visible at the same time without scrolling.
    - AC2: at 667x375 the pin pad is no taller than the viewport.

## Implementation Decisions

- The final card's actions are owned by the app shell: "Save & rematch" reuses the existing save
  path and only starts the rematch after the save resolves.
- The scoreboard component owns its frame buttons: it pins the Total column, names buttons by
  their visible marks and running total, exposes a way to focus a given bowler's frame, and keeps
  the active row visible above the pin pad. The pin pad publishes its rendered height as a CSS
  custom property so other parts can reserve room for it.
- Compact rows for 5+ bowlers are a styling state of the scoreboard; compact rows stay tappable.
- History cards derive "Game N" from saved games on the same calendar day, ordered by `playedAt`.
- Watch polling backs off to a 10-second interval after a 404 and returns to 2 seconds on a 200.
- The production build bundles the shell with esbuild into hashed files under one asset path;
  the Claude artifact keeps loading unbundled modules from `src/`.
- The service worker caches the app shell (HTML, hashed assets, fonts, icons) and never caches
  `/api/*`. It updates when a new build ships.
- The light-theme orange token darkens from `#c4471a` to `#b53e14`; dark theme is unchanged.
- In landscape on short screens the scoreboard and pin pad sit side by side and the pad is no
  longer pinned to the bottom.

## Testing Decisions

- Test external behaviour only: what a bowler sees and what the app sends to `/api/*`.
- UI stories are tested end to end with Playwright against the built `dist/`, using
  `tests/e2e/harness.cjs` (local static server, mocked `/api/*`, axe-core). Prior art:
  `tests/e2e/smoke.e2e.cjs`.
- Pure logic (scoring, session, stats) keeps using `node:test` unit tests in `tests/*.test.mjs`.
- Run `npm run check` and `npm run test:e2e` before every commit.

## Out of Scope

- A league PIN for saving and deleting games.
- Raising every touch target to 44px, and setup rename / move-down / name-limit messaging.
- Changes to scan, photos or live-lane server behaviour.

## Further Notes

Source: usability audit of https://frame-keeper.netlify.app on 2026-10-24 (axe-core 4.14 plus a
read-only click-through at 390, 375, 320, landscape, 200% text and desktop).
