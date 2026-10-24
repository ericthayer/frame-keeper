// End-to-end harness: serves the built dist/ over HTTP and drives it with Playwright.
// Every /api/* call is mocked per page, so tests never reach production data.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "../..");
const DIST = path.join(ROOT, "dist");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".txt": "text/plain",
};

/** Static server over dist/. Resolves { url, close, state }; set state.pageDelayMs to slow HTML responses. */
function startServer(dir = DIST) {
  const state = { pageDelayMs: 0 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir)) return res.writeHead(403).end();
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    if (state.pageDelayMs && file.endsWith(".html")) await new Promise((r) => setTimeout(r, state.pageDelayMs));
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end("not found");
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    resolve({ url: `http://127.0.0.1:${port}`, state, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) });
  }));
}

const launch = () => chromium.launch();

/**
 * New page with mocked API. Options: viewport, colorScheme, games (history list), saveStatus (POST /api/games status).
 * Returns { page, api } where api.calls records every mocked request as { method, path, body }.
 */
async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 390, height: 844 }, colorScheme: opts.colorScheme ?? "light", locale: "en-US", timezoneId: "America/New_York", serviceWorkers: opts.serviceWorkers ?? "block" });
  const page = await ctx.newPage();
  const api = { calls: [], errors: [] };
  page.on("pageerror", (e) => api.errors.push(e.message));
  await ctx.route("**/api/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const body = req.postData();
    api.calls.push({ method: req.method(), path: u.pathname, body });
    if (u.pathname === "/api/games" && req.method() === "GET") return route.fulfill({ json: { games: opts.games ?? [] } });
    if (u.pathname === "/api/games") return route.fulfill({ status: opts.saveStatus ?? 201, json: opts.saveStatus && opts.saveStatus >= 400 ? { error: "Save failed." } : { ok: true } });
    if (u.pathname.startsWith("/api/live/")) {
      if (req.method() === "GET") return route.fulfill(opts.liveGet ? opts.liveGet(api) : { status: 404, json: { error: "No live game on that lane." } });
      return route.fulfill({ json: { ok: true } });
    }
    if (u.pathname === "/api/scan") return route.fulfill({ json: opts.scan ?? { bowlers: [], notes: "" } });
    if (u.pathname.startsWith("/api/photos/")) return route.fulfill({ status: 201, json: { photos: [] } });
    return route.fulfill({ status: 404, json: {} });
  });
  return { page, api, ctx };
}

/** Open the app, then set up and start a game. Waits for the pin pad. */
async function startGame(page, base, names) {
  await page.goto(base + "/");
  await setupGame(page, names);
}

/** On an already-open app: Splash → Start → add bowlers → Roll it. Waits for the pin pad. */
async function setupGame(page, names) {
  await page.click("#splash-start");
  for (const n of names) {
    await page.fill("#fk-bowler-name", n);
    await page.keyboard.press("Enter");
  }
  await page.click("text=Roll it!");
  await page.waitForSelector("#pad:not([hidden])");
}

/** Type marks into the phone-keyboard box, 12 characters per submit. */
async function typeMarks(page, text) {
  for (let i = 0; i < text.length; i += 12) {
    await page.fill("#fk-type", text.slice(i, i + 12));
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(50);
}

/** Bowl a perfect game for every bowler and wait for the final card. */
async function finishGame(page, bowlers) {
  await typeMarks(page, "X".repeat(12 * bowlers));
  await page.waitForSelector("#final:not([hidden])");
}

/** Run axe-core; resolves the violations array. Tags default to WCAG 2.x A/AA. */
async function runAxe(page, tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]) {
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  return page.evaluate(async (t) => (await window.axe.run(document, { runOnly: { type: "tag", values: t } })).violations, tags);
}

module.exports = { ROOT, DIST, startServer, launch, newPage, startGame, setupGame, typeMarks, finishGame, runAxe };
