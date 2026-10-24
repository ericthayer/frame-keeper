# [AFK] 1c — History game times, quieter watch polling, no sideways scroll

Status: ready-for-agent

## Parent

.scratch/001-usability-pass/PRD.md

## What to build

History cards show the save time and, for same-day games, "Game N" in play order. The watch
screen backs off to one request per 10 seconds after the lane answers 404 and returns to 2 seconds
on a 200. The header's "Synced to the lanes" badge wraps or shrinks so nothing forces horizontal
scrolling at 320px or with 200% root text size.

## Acceptance criteria

- [ ] Every AC of stories 4, 6 and 8 holds, covered by tests (e2e in `tests/e2e/`; unit tests are
      fine for the polling interval logic).
- [ ] `npm run check` and `npm run test:e2e` pass.

## User stories covered

- 4 — No sideways scrolling on small or zoomed phones
  - AC1: at 320px wide, the splash, game, Leaders and History screens have a document
    scrollWidth no greater than the viewport width.
  - AC2: at 390px wide with the root font size set to 200%, the splash and game screens have a
    document scrollWidth no greater than the viewport width.
- 6 — Tell games from the same night apart
  - AC1: each History card shows the time the game was saved (e.g. "8:19 PM") next to its date.
  - AC2: when more than one game was saved on the same calendar day, each of those cards shows
    "Game N" for that day, numbered in the order played (earliest is Game 1).
- 8 — Stop hammering the server for an ended lane
  - AC1: after GET /api/live/<code> answers 404, the watch screen makes no more than one request
    per 10 seconds until a request returns 200.
  - AC2: once a request returns 200, polling returns to every 2 seconds.

## Notes

Files expected to change: `src/components/fk-history.js`, `src/dom.js`, `src/live.js` (and
`src/components/fk-watch.js` if needed), and the Marquee header section of `src/styles.css`.
Do not touch `src/main.js`, `app.html` or the scoreboard.

## Blocked by

None - can start immediately
