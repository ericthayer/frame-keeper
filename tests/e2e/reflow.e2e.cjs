// Reflow: no sideways scrolling on a 320px phone or with the root text size at 200%.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, newPage, startGame } = require("./harness.cjs");

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

const PERFECT = [...Array(9).fill([10]), [10, 10, 10]];
const GAMES = [{ id: "g1", playedAt: "2026-10-23T20:19:00", venue: "Starlite Lanes", bowlers: [{ name: "Eric", frames: PERFECT }, { name: "Dana", frames: PERFECT }] }];

/** Fails when the page can scroll sideways, once the header badge shows its final text. @param {import("playwright").Page} page @param {string} screen */
async function assertNoSideScroll(page, screen) {
  await page.waitForSelector('#sync:not([data-kind="pending"])');
  const { scroll, viewport } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  assert.ok(scroll <= viewport, `${screen}: scrollWidth ${scroll} > viewport ${viewport}`);
}

/** @param {import("playwright").Page} page */
const doubleRootText = (page) => page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });

test("at 320px wide the splash, game, Leaders and History screens fit", async () => {
  const { page } = await newPage(browser, { viewport: { width: 320, height: 640 }, games: GAMES });
  await page.goto(server.url + "/");
  await page.waitForSelector("#splash-start");
  await assertNoSideScroll(page, "splash");
  await page.goto(server.url + "/#leaders");
  await page.waitForSelector("#leaderboard *");
  await assertNoSideScroll(page, "leaders");
  await page.goto(server.url + "/#history");
  await page.waitForSelector("#history-list .card");
  await assertNoSideScroll(page, "history");
  await startGame(page, server.url, ["Eric", "Dana"]);
  await assertNoSideScroll(page, "game");
  await page.context().close();
});

test("at 390px wide with 200% root text the splash and game screens fit", async () => {
  const { page } = await newPage(browser, { viewport: { width: 390, height: 844 } });
  await page.goto(server.url + "/");
  await page.waitForSelector("#splash-start");
  await doubleRootText(page);
  await assertNoSideScroll(page, "splash");
  await startGame(page, server.url, ["Eric", "Dana"]);
  await doubleRootText(page);
  await assertNoSideScroll(page, "game");
  await page.context().close();
});
