# [AFK] 1b — Final card: no tap discards an unsaved game

Status: ready-for-agent

## Parent

.scratch/001-usability-pass/PRD.md

## What to build

On an unsaved finished game the final card offers "Save to history" and "Save & rematch" — the
plain Rematch that silently discards the game goes away until the game is saved. "Save & rematch"
saves first and starts the rematch only after the save succeeds; on failure the game stays and an
error shows. After saving, "Rematch" starts the new game immediately. The End game confirmation
wording matches whether the game is saved.

## Acceptance criteria

- [ ] Every AC of story 1 holds, covered by e2e tests in `tests/e2e/`.
- [ ] `npm run check` and `npm run test:e2e` pass.

## User stories covered

- 1 — No single tap throws away an unsaved game
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

## Notes

Files expected to change: `src/main.js`, the final card and End game markup in `app.html`, and the
Final section of `src/styles.css`. Keep `src/main.js` from growing: move the final-card wiring
into its own module if that keeps the shell under 300 lines.

## Blocked by

None - can start immediately
