# [AFK] 2a — Installable offline app: manifest, icons, service worker

Status: done

## Parent

.scratch/001-usability-pass/PRD.md

## What to build

The Netlify build ships a web app manifest (standalone, theme color, 192/512 icons) and an
apple-touch-icon, linked from dist/index.html, and a service worker that caches the app shell so a
reload with no signal still opens the app and the game in progress. `/api/*` is never served from
cache. The worker updates when a new build ships. Icons are original art in the app's matchbook
style (reuse the existing SVG art). The service worker registers only on the Netlify build, not
inside the Claude artifact.

## Acceptance criteria

- [ ] Story 9 AC3, AC4 and AC5 hold, covered by e2e tests (allow service workers in those tests).
- [ ] `npm run check` and `npm run test:e2e` pass.

## User stories covered

- 9 — Load fast, install, work offline (this slice: install and offline)
  - AC3: dist/index.html links a web app manifest declaring name "Frame Keeper", display
    "standalone", a theme color and 192px and 512px PNG icons that exist in dist/, plus an
    apple-touch-icon link to an existing PNG.
  - AC4: after one online visit, reloading with the network offline still shows the splash, and
    a game in progress is still on screen.
  - AC5: requests to /api/* are never answered from the offline cache.

## Notes

Files expected to change: `scripts/build.mjs`, a new service worker and manifest source, icon
PNGs, a small registration module imported once from `src/main.js` (add only the import line),
and the head block of `app.html` if needed.

## Blocked by

- .scratch/001-usability-pass/issues/04-fast-loads-bundled-assets.md
- .scratch/001-usability-pass/issues/02-final-card-save-guard.md
