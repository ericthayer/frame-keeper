# [AFK] 1d — Fast loads: bundled, hashed, long-cached assets

Status: ready-for-agent

## Parent

.scratch/001-usability-pass/PRD.md

## What to build

The Netlify build bundles the app shell with esbuild into content-hashed JS and CSS files under
one asset path, rewrites dist/index.html to reference only those, and netlify.toml caches the
hashed path for a year (immutable) while HTML always revalidates. The Claude artifact path
(`app.html` + unbundled `src/`) keeps working unchanged. The e2e harness serves dist/, so all
existing e2e tests must still pass against the bundled build.

## Acceptance criteria

- [ ] Story 9 AC1, AC2 and AC6 hold, covered by tests.
- [ ] `npm run check`, `npm run build` and `npm run test:e2e` pass.

## User stories covered

- 9 — Load fast, install, work offline (this slice: bundling and caching)
  - AC1: the production build (dist/) loads the app's JavaScript from at most 2 script files and
    its CSS from at most 1 stylesheet, each with a content hash in its filename, and dist/
    index.html references only those hashed files.
  - AC2: netlify.toml sets `Cache-Control: public, max-age=31536000, immutable` for the hashed
    asset path and `public, max-age=0, must-revalidate` for HTML.
  - AC6: app.html (the Claude artifact page) still loads the unbundled ES modules from src/.

## Notes

Files expected to change: `scripts/build.mjs`, `netlify.toml`, `package.json` (esbuild as a
pinned devDependency, a version at least two weeks old). Netlify functions keep their own bundling.

## Blocked by

None - can start immediately
