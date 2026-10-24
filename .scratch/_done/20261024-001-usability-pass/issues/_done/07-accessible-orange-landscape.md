# [AFK] 2c — Accessible orange and a landscape layout

Status: done

## Parent

.scratch/001-usability-pass/PRD.md

## What to build

Darken the light-theme orange from `#c4471a` to `#b53e14` everywhere it is used for text or text
backgrounds (token and literals), so every screen passes contrast in both themes. In landscape on
short screens (height ≤ 500px) the scoreboard and pin pad sit side by side and the pad is no
longer pinned to the bottom, so the active row and all keys are visible together.

## Acceptance criteria

- [ ] Every AC of stories 10 and 11 holds, covered by e2e tests in `tests/e2e/`.
- [ ] `npm run check` and `npm run test:e2e` pass.

## User stories covered

- 10 — All text meets contrast minimums
  - AC1: axe reports no color-contrast violations on the splash, setup, game, final, Leaders and
    History screens, in both light and dark themes.
- 11 — Scoreboard and pin pad on screen together in landscape
  - AC1: at 667x375 during a game, after the sheet scrolls into view, the active bowler's row
    and all 12 pin keys are fully visible at the same time without scrolling.
  - AC2: at 667x375 the pin pad is no taller than the viewport.

## Notes

Files expected to change: `src/styles.css` (color tokens and literals, a landscape media block)
and the art colors in `app.html` if any use the old orange.

## Blocked by

- .scratch/001-usability-pass/issues/01-scoreboard-totals-rows-labels.md
- .scratch/001-usability-pass/issues/02-final-card-save-guard.md
- .scratch/001-usability-pass/issues/03-history-watch-reflow.md
