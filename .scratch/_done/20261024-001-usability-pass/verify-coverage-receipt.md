## Coverage receipt — verify-coverage
- prd: .scratch/001-usability-pass/PRD.md
- branch: claude/retro-bowling-scorekeeper-6h7iqx
- verified-sha: d1edf232712c4f207dbdbc32287c041e53364be5
- mode: full
- invocation: auto
- matrix: covered=11 gap=0 deferred=0 unverified=0 out-of-scope=0
- deferred-stories: none
- gaps-filed: none (no gaps)
- ts: 2026-10-24T17:21:52Z

| Story | State | Evidence |
|---|---|---|
| 1 Save guard (AC1–5) | covered | tests/e2e/final-card.e2e.cjs (5 tests) |
| 2 Totals in view (AC1–2) | covered | tests/e2e/scoreboard.e2e.cjs "live totals stay fully in view…", "History score sheet totals…" |
| 3 Active row above pad (AC1–3) | covered | tests/e2e/scoreboard.e2e.cjs "at 375x667 with 6 bowlers…", "with 5+ bowlers…compact", "with 4 or fewer…" |
| 4 No sideways scroll (AC1–2) | covered | tests/e2e/reflow.e2e.cjs (2 tests) |
| 5 Frame-button names (AC1–2) | covered (Tier B tightened) | tests/e2e/scoreboard.e2e.cjs "frame buttons are named by their visible marks and running total" — mutation-proved (drop mark; swap order) |
| 6 History time + Game N (AC1–2) | covered | tests/e2e/history.e2e.cjs (2 tests) |
| 7 Escape + skip link (AC1–3) | covered | tests/e2e/keyboard.e2e.cjs (4 tests) |
| 8 Watch back-off (AC1–2) | covered | tests/live.test.mjs (2 tests, fake timers) |
| 9 Fast, installable, offline (AC1–6) | covered | tests/build.test.mjs (AC1, AC2, AC3, AC6); tests/e2e/offline.e2e.cjs (AC4, AC5) |
| 10 Contrast light + dark (AC1) | covered | tests/e2e/contrast.e2e.cjs (4 tests) |
| 11 Landscape (AC1–2) | covered | tests/e2e/landscape.e2e.cjs (3 tests) |

Suite at verified-sha: npm run check 21/21, npm run test:e2e 34/34.
