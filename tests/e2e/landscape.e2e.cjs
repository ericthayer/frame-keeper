// Landscape on a short phone: the scoreboard and the pin pad share the screen.
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

const LANDSCAPE = { width: 667, height: 375 };

/**
 * What of the active row (its name and Total cells) and the 12 pin keys is not fully visible:
 * outside the viewport, under the tab bar, or (for the row) under the pin pad.
 * @param {import("playwright").Page} page
 */
async function hiddenParts(page) {
  return page.evaluate(() => {
    const floor = document.querySelector(".tabbar").getBoundingClientRect().top;
    const pad = document.querySelector("#pad").getBoundingClientRect();
    /** @param {Element} el */
    const out = (el) => {
      const r = el.getBoundingClientRect();
      return r.top < 0 || r.left < 0 || r.bottom > floor || r.right > window.innerWidth;
    };
    /** @param {Element} el */
    const underPad = (el) => {
      const r = el.getBoundingClientRect();
      return r.left < pad.right && r.right > pad.left && r.top < pad.bottom && r.bottom > pad.top;
    };
    const keys = [...document.querySelectorAll("#pad .key")];
    const cells = [...document.querySelectorAll("#board tr.is-up :is(.board__name, .board__total)")];
    return {
      keys: keys.length,
      hidden: [
        ...cells.filter((c) => out(c) || underPad(c)).map((c) => `active row ${c.className}`),
        ...keys.filter(out).map((k) => `key ${k.dataset.key}`),
      ],
    };
  });
}

test("at 667x375 the active row and all 12 pin keys are visible together, turn after turn", async () => {
  const { page, api } = await newPage(browser, { viewport: LANDSCAPE });
  await startGame(page, server.url, ["Eric", "Dana", "Sam"]);
  await page.waitForTimeout(300);
  assert.deepEqual(await hiddenParts(page), { keys: 12, hidden: [] }, "after the sheet scrolls into view");
  for (const frame of ["81", "X", "7/", "9-", "81", "X", "72"]) {
    await typeMarks(page, frame);
    await page.waitForTimeout(300);
    assert.deepEqual(await hiddenParts(page), { keys: 12, hidden: [] }, `after ${frame}`);
  }
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("at 667x375 with 6 bowlers the active row stays visible beside the pad", async () => {
  const { page, api } = await newPage(browser, { viewport: LANDSCAPE });
  await startGame(page, server.url, ["Eric", "Dana", "Sam", "Alex", "Bo", "Cy"]);
  for (const frame of ["81", "X", "7/", "9-", "81", "X", "72", "X"]) {
    await typeMarks(page, frame);
    await page.waitForTimeout(300);
    assert.deepEqual(await hiddenParts(page), { keys: 12, hidden: [] }, `after ${frame}`);
  }
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("at 667x375 the pin pad is no taller than the viewport", async () => {
  const { page } = await newPage(browser, { viewport: LANDSCAPE });
  await startGame(page, server.url, ["Eric", "Dana"]);
  const height = await page.$eval("#pad", (p) => p.getBoundingClientRect().height);
  assert.ok(height <= LANDSCAPE.height, `pad is ${height}px tall`);
  await page.context().close();
});
