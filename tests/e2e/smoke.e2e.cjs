// Smoke test for the e2e harness: the built app loads, a game starts, and typed marks score.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, newPage, startGame, typeMarks } = require("./harness.cjs");

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

test("splash loads and a two-bowler game scores typed marks", async () => {
  const { page, api } = await newPage(browser);
  await startGame(page, server.url, ["Eric", "Dana"]);
  await typeMarks(page, "81 72");
  const totals = await page.$$eval("#board .board__score", (els) => els.map((e) => e.textContent));
  assert.deepEqual(totals, ["9", "9"]);
  assert.deepEqual(api.errors, []);
  await page.context().close();
});
