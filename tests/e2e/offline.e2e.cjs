// Story 9 AC4/AC5: after one online visit the installed shell works with no signal, and
// /api/* is never answered from the offline cache. Service workers are allowed here.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, newPage, typeMarks } = require("./harness.cjs");

let server;
let browser;
before(async () => {
  server = await startServer();
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

/** Opens the app online and waits until its service worker is active (shell cached). */
async function visitOnline(opts = {}) {
  const session = await newPage(browser, { ...opts, serviceWorkers: "allow" });
  await session.page.goto(server.url + "/");
  const active = await session.page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ]));
  assert.equal(active, true, "no service worker became active");
  return session;
}

test("after one online visit, reloading offline still shows the splash and the app runs", async () => {
  const { page, ctx, api } = await visitOnline();
  await ctx.setOffline(true);
  await page.reload();
  assert.equal(await page.isVisible("#splash-start"), true);
  await page.click("#splash-start");
  await page.waitForSelector("#setup:not([hidden])");
  assert.deepEqual(api.errors, []);
  await ctx.close();
});

test("a game in progress is still on screen after reloading offline", async () => {
  const { page, ctx, api } = await visitOnline();
  await page.click("#splash-start");
  for (const name of ["Eric", "Dana"]) {
    await page.fill("#fk-bowler-name", name);
    await page.keyboard.press("Enter");
  }
  await page.click("text=Roll it!");
  await page.waitForSelector("#pad:not([hidden])");
  await typeMarks(page, "81 72");
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector("#pad:not([hidden])");
  const totals = await page.$$eval("#board .board__score", (els) => els.map((e) => e.textContent));
  assert.deepEqual(totals, ["9", "9"]);
  assert.deepEqual(api.errors, []);
  await ctx.close();
});

test("/api/* requests are never answered by the service worker or kept in its cache", async () => {
  const { page, ctx } = await visitOnline({ games: [] });
  /** @type {import("playwright").Response[]} */
  const apiResponses = [];
  page.on("response", (r) => { if (new URL(r.url()).pathname.startsWith("/api/")) apiResponses.push(r); });
  await page.reload();
  await page.waitForSelector("#splash-start");
  const online = await page.evaluate(() => fetch("/api/games").then((r) => r.status));
  assert.equal(online, 200);
  await ctx.setOffline(true);
  await page.reload();
  await page.evaluate(() => fetch("/api/games").catch(() => null));
  const cached = await page.evaluate(async () => {
    const urls = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    }
    return urls;
  });
  assert.ok(cached.length > 0, "the shell cache is empty");
  assert.deepEqual(cached.filter((u) => new URL(u).pathname.startsWith("/api/")), []);
  assert.ok(apiResponses.length >= 2, `saw ${apiResponses.length} /api responses`);
  assert.deepEqual(apiResponses.filter((r) => r.fromServiceWorker()).map((r) => r.url()), []);
  await ctx.close();
});
