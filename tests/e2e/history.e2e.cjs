// History cards: save time on every card, "Game N" for games saved on the same day.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, newPage } = require("./harness.cjs");

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

/** A saved game; playedAt has no zone, so it reads as the browser's local time. */
const game = (id, playedAt) => ({ id, playedAt, venue: "", bowlers: [{ name: "Eric", frames: PERFECT }] });

/** Summary text of each History card, newest first. */
async function cardSummaries(page) {
  await page.goto(server.url + "/#history");
  await page.waitForSelector("#history-list .card__summary");
  return page.$$eval("#history-list .card__summary", (els) => els.map((e) => e.textContent ?? ""));
}

test("each History card shows the time the game was saved", async () => {
  const { page, api } = await newPage(browser, { games: [game("g1", "2026-10-23T20:19:00")] });
  const [summary] = await cardSummaries(page);
  assert.match(summary, /Oct 23, 2026/);
  assert.match(summary, /8:19\sPM/);
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("games saved on the same day are numbered Game 1, Game 2… in play order", async () => {
  const games = [
    game("late", "2026-10-23T21:40:00"),
    game("lone", "2026-10-22T19:05:00"),
    game("mid", "2026-10-23T20:19:00"),
    game("early", "2026-10-23T19:02:00"),
  ];
  const { page } = await newPage(browser, { games });
  const summaries = await cardSummaries(page);
  const numbers = summaries.map((s) => s.match(/Game \d+/)?.[0] ?? null);
  assert.deepEqual(numbers, ["Game 3", "Game 2", "Game 1", null]);
  await page.context().close();
});
