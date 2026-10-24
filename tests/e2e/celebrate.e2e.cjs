// Strike and spare pop-ups: a vintage matchbook cover with the call and a script tagline;
// a gutter keeps the plain sign. Screen readers still hear the call through the live region.
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

/** Tap pin-pad keys, then read what the pop-up shows and announces. */
async function popAfter(page, keys) {
  for (const k of keys) await page.click(k === "-" ? "#pad .key--gutter" : `#pad .key:text-is("${k}")`);
  await page.waitForSelector(".celebrate.is-on");
  return page.evaluate(() => {
    const seen = (sel) => {
      const el = document.querySelector(sel);
      return !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none";
    };
    return {
      tone: document.querySelector(".celebrate")?.getAttribute("data-tone"),
      book: seen(".celebrate__book"),
      sign: seen(".celebrate__sign"),
      word: document.querySelector(".celebrate__word")?.textContent,
      tagline: document.querySelector(".celebrate__tagline")?.textContent,
      announced: document.querySelector(".celebrate [role=status]")?.textContent,
    };
  });
}

test("a strike shows the matchbook with STRIKE! and its tagline", async () => {
  const { page, api } = await newPage(browser);
  await startGame(page, server.url, ["Eric"]);
  const pop = await popAfter(page, ["X"]);
  assert.deepEqual(pop, { tone: "strike", book: true, sign: false, word: "STRIKE!", tagline: "right in the pocket!", announced: "STRIKE!" });
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("a spare shows the matchbook with SPARE! and its tagline", async () => {
  const { page, api } = await newPage(browser);
  await startGame(page, server.url, ["Eric"]);
  const pop = await popAfter(page, ["7", "/"]);
  assert.deepEqual(pop, { tone: "spare", book: true, sign: false, word: "SPARE!", tagline: "picked it up!", announced: "SPARE!" });
  assert.deepEqual(api.errors, []);
  await page.context().close();
});

test("a gutter ball keeps the plain sign", async () => {
  const { page, api } = await newPage(browser);
  await startGame(page, server.url, ["Eric"]);
  const pop = await popAfter(page, ["-"]);
  assert.equal(pop.tone, "gutter");
  assert.equal(pop.book, false);
  assert.equal(pop.sign, true);
  assert.match(pop.announced ?? "", /Gutter/);
  assert.deepEqual(api.errors, []);
  await page.context().close();
});
