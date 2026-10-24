// Story 7: score from the keyboard alone — Escape cancels a frame fix, focus comes back, a skip link reaches the pad.
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

/** Accessible names of every live frame button: marks and running totals, so any change to the frames shows. */
const frameNames = (page) => page.$$eval("#board .frame__btn", (els) => els.map((e) => e.getAttribute("aria-label")));
const frameButton = (page, bowler, frame) => page.locator("#board tbody tr").nth(bowler).locator(".frame__btn").nth(frame);

/** Start a two-bowler game with a few frames down, then open a fix on Dana's frame 1 from the keyboard. */
async function openFix(page) {
  await startGame(page, server.url, ["Eric", "Dana"]);
  await typeMarks(page, "X81X");
  const before = await frameNames(page);
  await frameButton(page, 1, 0).focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#edit-banner:not([hidden])");
  return before;
}

test("Escape while fixing a frame cancels the fix and leaves the frames as they were", async () => {
  const { page, api } = await newPage(browser);
  const before = await openFix(page);
  await page.focus("#fk-type");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#edit-banner", { state: "hidden" });
  assert.deepEqual(await frameNames(page), before);
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

/** Accessible name of the focused element, or its tag when nothing named holds focus. */
const focusedName = (page) => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);

test("after Escape cancels a fix, focus is back on the frame that was being fixed", async () => {
  const { page } = await newPage(browser);
  await openFix(page);
  await page.focus("#fk-type");
  await page.keyboard.press("Escape");
  await page.waitForSelector("#edit-banner", { state: "hidden" });
  assert.match(await focusedName(page), /^Dana, frame 1: 8 1, 9,/);
  await page.context().close();
});

test("after the Cancel button cancels a fix, focus is back on the frame that was being fixed", async () => {
  const { page } = await newPage(browser);
  const before = await openFix(page);
  await page.focus("#edit-cancel");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#edit-banner", { state: "hidden" });
  assert.match(await focusedName(page), /^Dana, frame 1: 8 1, 9,/);
  assert.deepEqual(await frameNames(page), before);
  await page.context().close();
});
