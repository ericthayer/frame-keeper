# [AFK] 1a — Scoreboard: pinned totals, visible active row, compact rows, frame-button names

Status: done

## Parent

.scratch/001-usability-pass/PRD.md

## What to build

Make the scoreboard readable on a phone with a full lane. The Total column stays pinned to the
right edge while frames scroll (live game and History sheets). The active bowler's row is kept
visible above the pinned pin pad on every turn change. With 5+ bowlers, rows of bowlers who aren't
up shrink to a compact height (still tappable, still showing name and running totals). Frame
buttons are named by what they show (marks + running total). Expose a way to focus a given
bowler's frame button (used by slice 2b). The pin pad publishes its rendered height as a CSS
custom property (`--pad-h` on the document element) so the board can keep rows above it.

## Acceptance criteria

- [ ] Totals fully in the viewport at 390px, live and in History (story 2).
- [ ] Active row stays above the pad at 375x667 with 6 bowlers; compact rows for 5+ (story 3).
- [ ] Frame-button names include visible marks and total; axe clean for label mismatch (story 5).
- [ ] The scoreboard exposes `focusFrame(bowler, frame)`.
- [ ] e2e tests in `tests/e2e/` cover every AC below; `npm run check` and `npm run test:e2e` pass.

## User stories covered

- 2 — Every total visible without scrolling sideways
  - AC1: at 390px wide during a game, every bowler's Total cell lies fully inside the viewport,
    including after the frames scroll horizontally to frame 10.
  - AC2: at 390px wide, the Total cells of an expanded History score sheet lie fully inside the
    viewport.
- 3 — Whoever is up stays visible above the pin pad
  - AC1: at 375x667 with 6 bowlers, after each turn change the active bowler's row lies fully
    between the top of the viewport and the top of the pin pad.
  - AC2: with 5 or more bowlers, every row except the active bowler's is at most 40px tall and
    still shows that bowler's name and total; the active row keeps full height.
  - AC3: with 4 or fewer bowlers, all rows keep full height.
- 5 — Frame buttons named by what they show
  - AC1: each scoreboard frame button's accessible name contains its visible marks and its
    visible running total.
  - AC2: axe reports no label-content-name-mismatch violations on the game and final screens.

## Notes

Files expected to change: `src/components/fk-scoreboard.js`, `src/components/fk-pinpad.js`, and
the Scoreboard / Pin pad sections of `src/styles.css` (keep new rules inside those sections). Do
not touch `src/main.js` or `app.html` (other slices own them this wave).

## Blocked by

None - can start immediately
