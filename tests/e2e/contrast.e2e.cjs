// Contrast: every screen passes axe's color-contrast rule in the light and the dark theme.
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

const PERFECT = [...Array(9).fill([10]), [10, 10, 10]];
const OPEN = [...Array(9).fill([8, 1]), [7, 3, 5]];
const GAMES = [
  { id: "g1", playedAt: "2026-10-23T20:19:00", venue: "Starlite Lanes", bowlers: [{ name: "Eric", frames: PERFECT }, { name: "Dana", frames: OPEN }] },
  { id: "g2", playedAt: "2026-10-16T19:05:00", venue: "Starlite Lanes", bowlers: [{ name: "Dana", frames: PERFECT }, { name: "Eric", frames: OPEN }] },
];

/** Each color-contrast failure on the page as "selector: summary", once the header badge and any celebration settle. @param {import("playwright").Page} page */
async function contrastFailures(page) {
  await page.waitForSelector('#sync:not([data-kind="pending"])');
  await page.waitForSelector(".celebrate:not(.is-on)", { state: "attached" });
  const violations = (await runAxe(page)).filter((v) => v.id === "color-contrast");
  return violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${n.failureSummary?.split("\n").pop()?.trim()}`));
}

for (const colorScheme of /** @type {const} */ (["light", "dark"])) {
  test(`${colorScheme} theme: splash, setup, game and final screens have no contrast failures`, async () => {
    const { page, api } = await newPage(browser, { colorScheme });
    await page.goto(server.url + "/");
    await page.waitForSelector("#splash-start");
    assert.deepEqual(await contrastFailures(page), [], "splash");

    await page.click("#splash-start");
    await page.fill("#fk-bowler-name", "Eric");
    await page.keyboard.press("Enter");
    await page.waitForSelector("#setup .roster__item");
    assert.deepEqual(await contrastFailures(page), [], "setup");

    await startGame(page, server.url, ["Eric", "Dana"]);
    await typeMarks(page, "X 7/ 9- 81");
    assert.deepEqual(await contrastFailures(page), [], "game");

    await finishGame(page, 2);
    assert.deepEqual(await contrastFailures(page), [], "final");
    assert.deepEqual(api.errors, []);
    await page.context().close();
  });

  test(`${colorScheme} theme: Leaders and History screens have no contrast failures`, async () => {
    const { page, api } = await newPage(browser, { colorScheme, games: GAMES });
    await page.goto(server.url + "/#leaders");
    await page.waitForSelector("#leaderboard *");
    assert.deepEqual(await contrastFailures(page), [], "leaders");

    await page.goto(server.url + "/#history");
    await page.click("#history-list .card__summary");
    await page.waitForSelector("#history-list .card[open] .board__total");
    assert.deepEqual(await contrastFailures(page), [], "history");
    assert.deepEqual(api.errors, []);
    await page.context().close();
  });
}
