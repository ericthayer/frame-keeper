// Scoreboard on a phone: pinned totals, the active row above the pad, compact rows and frame-button names.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, newPage, startGame, typeMarks, finishGame, runAxe } = require("./harness.cjs");

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

/** Edges of every Total cell under `scope` that is not fully inside the viewport's width. */
async function clippedTotals(page, scope) {
  return page.$$eval(`${scope} .board__total`, (cells) => cells
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.left < 0 || r.right > window.innerWidth)
    .map((r) => ({ left: r.left, right: r.right })));
}

/** Wait for the board's smooth horizontal scroll to settle. */
async function settle(page) {
  await page.waitForTimeout(600);
}

test("live totals stay fully in view at 390px, at the start and at frame 10", async () => {
  const { page, api } = await newPage(browser, { viewport: { width: 390, height: 844 } });
  await startGame(page, server.url, ["Eric", "Dana", "Sam"]);
  await settle(page);
  assert.equal(await page.locator("#board .board__total").count(), 3);
  assert.deepEqual(await clippedTotals(page, "#board"), []);
  await typeMarks(page, "81".repeat(27));
  await settle(page);
  assert.ok(await page.$eval("#board .board__scroll", (s) => s.scrollLeft > 0), "frames scrolled toward frame 10");
  assert.deepEqual(await clippedTotals(page, "#board"), []);
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

const strikes = (n) => Array.from({ length: n }, () => [10]);
const savedGame = {
  id: "g1", playedAt: "2026-10-23T03:19:00.000Z", venue: "Starlite Lanes",
  bowlers: [
    { name: "Eric", frames: [...strikes(9), [10, 10, 10]] },
    { name: "Dana", frames: [...Array.from({ length: 9 }, () => [8, 1]), [7, 3, 5]] },
  ],
};

test("History score sheet totals stay fully in view at 390px", async () => {
  const { page, api } = await newPage(browser, { viewport: { width: 390, height: 844 }, games: [savedGame] });
  await page.goto(server.url + "/");
  await page.click('.tabbar__btn[data-view="history"]');
  await page.click("#history-list .card__summary");
  await page.waitForSelector("#history-list .card[open] .board__total");
  assert.equal(await page.locator("#history-list .board__total").count(), 2);
  assert.deepEqual(await clippedTotals(page, "#history-list"), []);
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

/** Frame buttons whose accessible name leaves out a visible mark or the visible running total. */
async function misnamedFrames(page) {
  const buttons = page.locator("#board .frame__btn");
  const bad = [];
  for (let i = 0; i < (await buttons.count()); i++) {
    const btn = buttons.nth(i);
    const shown = await btn.evaluate((b) => [...b.querySelectorAll(".mark, .running")].map((e) => e.textContent.trim()).filter(Boolean));
    const name = (await btn.ariaSnapshot()).match(/button "(.*)"/)?.[1] ?? "";
    // Look only past "Eric, frame 1:" so a mark like "1" can't match the frame number, and keep visible order.
    const words = name.slice(name.indexOf(":") + 1).split(/[\s,]+/).filter(Boolean);
    let at = 0;
    const inOrder = shown.length === 0 || name.includes(":") && shown.every((t) => (at = words.indexOf(t, at) + 1) > 0);
    if (!inOrder) bad.push({ shown, name });
  }
  return bad;
}

const nameMismatches = async (page) => (await runAxe(page)).filter((v) => v.id === "label-content-name-mismatch");

test("frame buttons are named by their visible marks and running total", async () => {
  const { page, api } = await newPage(browser);
  await startGame(page, server.url, ["Eric", "Dana"]);
  await typeMarks(page, "X 7/ 9- 81 X X");
  assert.deepEqual(await misnamedFrames(page), []);
  assert.deepEqual(await nameMismatches(page), []);
  await page.context().close();

  const final = await newPage(browser);
  await startGame(final.page, server.url, ["Eric", "Dana"]);
  await finishGame(final.page, 2);
  assert.deepEqual(await misnamedFrames(final.page), []);
  assert.deepEqual(await nameMismatches(final.page), []);
  assert.deepEqual([...api.errors, ...final.api.errors], []);
  await final.page.context().close();
});

const SIX = ["Eric", "Dana", "Sam", "Alex", "Bo", "Cy"];

/** Each scoreboard row's height, whether it is the active row, and whether its name and total are visible. */
async function rows(page) {
  return page.$$eval("#board tbody tr", (trs) => trs.map((tr) => {
    const seen = (el) => !!el && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== "hidden";
    const who = tr.querySelector(".board__who");
    const score = tr.querySelector(".board__score");
    return {
      height: tr.getBoundingClientRect().height,
      up: tr.classList.contains("is-up"),
      shows: seen(who) && seen(score) && who.textContent.trim().length > 0 && score.textContent.trim().length > 0,
    };
  }));
}

test("with 5+ bowlers, rows of bowlers who aren't up are compact; the active row keeps full height", async () => {
  const { page, api } = await newPage(browser, { viewport: { width: 375, height: 667 } });
  await startGame(page, server.url, SIX);
  await typeMarks(page, "81 X 7/");
  const list = await rows(page);
  assert.equal(list.length, 6);
  assert.equal(list.filter((r) => r.up).length, 1);
  for (const r of list) {
    assert.ok(r.shows, "name and total visible");
    if (r.up) assert.ok(r.height >= 58, `active row is full height (${r.height}px)`);
    else assert.ok(r.height <= 40, `other rows are compact (${r.height}px)`);
  }
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("with 4 or fewer bowlers, every row keeps full height", async () => {
  const { page } = await newPage(browser, { viewport: { width: 375, height: 667 } });
  await startGame(page, server.url, SIX.slice(0, 4));
  await typeMarks(page, "81 X");
  for (const r of await rows(page)) assert.ok(r.height >= 58, `full height (${r.height}px)`);
  await page.context().close();
});

test("at 375x667 with 6 bowlers, the active row stays between the top of the viewport and the pin pad", async () => {
  const { page, api } = await newPage(browser, { viewport: { width: 375, height: 667 } });
  await startGame(page, server.url, SIX);
  for (const frame of ["81", "X", "7/", "9-", "81", "X", "72", "X", "63", "5/", "X", "81", "9-"]) {
    await typeMarks(page, frame);
    await page.waitForTimeout(400);
    const { row, padTop } = await page.evaluate(() => {
      const r = document.querySelector("#board tr.is-up").getBoundingClientRect();
      return { row: { top: r.top, bottom: r.bottom }, padTop: document.querySelector("#pad").getBoundingClientRect().top };
    });
    assert.ok(row.top >= 0 && row.bottom <= padTop, `after ${frame}: row ${row.top}-${row.bottom}, pad top ${padTop}`);
  }
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("focusFrame(bowler, frame) puts keyboard focus on that bowler's frame button, even across a re-render", async () => {
  const { page } = await newPage(browser);
  await startGame(page, server.url, ["Eric", "Dana"]);
  await typeMarks(page, "X 7/ 81");
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  await page.evaluate(() => document.querySelector("#board").focusFrame(1, 0));
  assert.match(await focused(), /^Dana, frame 1: 7 \//);
  await page.evaluate(() => {
    const board = document.querySelector("#board");
    board.edit = null;
    board.focusFrame(0, 1);
  });
  await page.waitForTimeout(50);
  assert.match(await focused(), /^Eric, frame 2: 8 1/);
  await page.context().close();
});
