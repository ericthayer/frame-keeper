// Story 1: no single tap on the final card or End game throws away an unsaved game.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, newPage, startGame, finishGame } = require("./harness.cjs");

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

/** Labels of the buttons a bowler can see on the final card. */
const finalButtons = (page) => page.$$eval("#final button", (els) => els.filter((e) => e.checkVisibility()).map((e) => e.textContent?.trim()));

test("an unsaved final card offers only saving actions", async () => {
  const { page, api } = await newPage(browser);
  await startGame(page, server.url, ["Eric", "Dana"]);
  await finishGame(page, 2);
  assert.deepEqual(await finalButtons(page), ["Save to history", "Save & rematch"]);
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

const PERFECT = [...Array(9).fill([10]), [10, 10, 10]];
const posts = (api) => api.calls.filter((c) => c.method === "POST" && c.path === "/api/games");
const boardNames = (page) => page.$$eval("#board .board__who", (els) => els.map((e) => e.textContent?.trim()));

/** Waits until a fresh game is on the lane: final card gone, pad back, first bowler up in frame 1. */
async function waitForNewGame(page) {
  await page.waitForSelector("#final", { state: "hidden" });
  await page.waitForSelector("#pad:not([hidden])");
  assert.equal(await page.textContent("#nowup-detail"), "Frame 1 · Ball 1");
}

test("Save & rematch saves the finished game once, then starts the same crew at frame 1", async () => {
  const { page, api } = await newPage(browser);
  await startGame(page, server.url, ["Eric", "Dana", "Lou"]);
  await finishGame(page, 3);
  await page.click("text=Save & rematch");
  await waitForNewGame(page);

  const saved = posts(api);
  assert.equal(saved.length, 1);
  const record = JSON.parse(saved[0].body);
  assert.deepEqual(record.bowlers, ["Eric", "Dana", "Lou"].map((name) => ({ name, frames: PERFECT })));
  assert.deepEqual(await boardNames(page), ["Eric", "Dana", "Lou"]);
  assert.equal(await page.textContent("#nowup-name"), "Eric");
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("a failed Save & rematch keeps the finished game and says why", async () => {
  const { page, api } = await newPage(browser, { saveStatus: 500 });
  await startGame(page, server.url, ["Eric", "Dana"]);
  await finishGame(page, 2);
  await page.click("text=Save & rematch");
  await page.waitForFunction(() => document.getElementById("save-status")?.textContent?.startsWith("Didn't save"));

  assert.equal(posts(api).length, 1);
  assert.ok(await page.isVisible("#final"));
  assert.ok(await page.isHidden("#pad"));
  assert.deepEqual(await page.$$eval("#board .board__score", (els) => els.map((e) => e.textContent)), ["300", "300"]);
  assert.deepEqual(await finalButtons(page), ["Save to history", "Save & rematch"]);
  await page.context().close();
});

test("once saved, Rematch starts the same crew straight away", async () => {
  const { page, api } = await newPage(browser);
  await startGame(page, server.url, ["Eric", "Dana"]);
  await finishGame(page, 2);
  await page.click("text=Save to history");
  await page.waitForSelector("#final button:text-is('Rematch')");
  assert.ok(!(await finalButtons(page)).includes("Save & rematch"));

  await page.click("#final button:text-is('Rematch')");
  await waitForNewGame(page);
  assert.equal(posts(api).length, 1);
  assert.deepEqual(await boardNames(page), ["Eric", "Dana"]);
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("End game warns about losing scores only while the game is unsaved", async () => {
  const { page } = await newPage(browser);
  await startGame(page, server.url, ["Eric"]);
  await finishGame(page, 1);
  const confirmText = async () => {
    await page.click("#quit-btn");
    const text = await page.textContent("#quit-confirm");
    await page.click("#quit-no");
    return text;
  };

  const unsaved = await confirmText();
  assert.match(unsaved, /unsaved scores are lost/i);
  assert.doesNotMatch(unsaved, /history/i);

  await page.click("text=Save to history");
  await page.waitForSelector("#final button:text-is('Rematch')");
  const saved = await confirmText();
  assert.match(saved, /safe in History/);
  assert.doesNotMatch(saved, /lost/i);
  await page.context().close();
});
