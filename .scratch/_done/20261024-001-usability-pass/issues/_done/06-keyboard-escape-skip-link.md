# [AFK] 2b — Keyboard: Escape cancels a frame fix, focus returns, skip link to the pad

Status: done

## Parent

.scratch/001-usability-pass/PRD.md

## What to build

Escape cancels a frame fix. After a fix is cancelled (Escape or Cancel), focus lands on the frame
button that was being fixed (use the scoreboard's `focusFrame` from slice 1a). During a game a
"Skip to pin pad" link is the first focusable element in the Lanes view and moves focus to the
typed-marks box; it is visually hidden until focused.

## Acceptance criteria

- [ ] Every AC of story 7 holds, covered by e2e tests in `tests/e2e/`.
- [ ] `npm run check` and `npm run test:e2e` pass.

## User stories covered

- 7 — Cancel a frame fix and reach the pin pad from the keyboard
  - AC1: pressing Escape while fixing a frame cancels the fix: the edit banner hides and the
    frames are unchanged.
  - AC2: after a frame fix is cancelled (Escape or the Cancel button), keyboard focus is on the
    scoreboard frame button that was being fixed.
  - AC3: during a game, a "Skip to pin pad" link is the first focusable element in the Lanes
    view, and activating it moves focus to the typed-marks box.

## Notes

Files expected to change: `src/main.js` (or the module it delegates game wiring to), the live
game markup in `app.html`, and a small skip-link rule in `src/styles.css`.

## Blocked by

- .scratch/001-usability-pass/issues/01-scoreboard-totals-rows-labels.md
- .scratch/001-usability-pass/issues/02-final-card-save-guard.md
