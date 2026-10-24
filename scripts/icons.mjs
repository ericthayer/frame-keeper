// Renders the app icons in public/icons/ from the matchbook art in app.html: the gold pins and
// walnut ball on a paper disc, full-bleed walnut so the 512px icon also works as a maskable icon.
// Dev-only (needs Playwright); run `node scripts/icons.mjs` after changing the art and commit the PNGs.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("app.html", root), "utf8");
/** @param {string} id */
const symbol = (id) => page.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`))?.[0] ?? "";

const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <style>
    .a-line { stroke: #36190c; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; fill: none; }
    .a-gold, .a-gold.a-line { fill: #e7a336; } .a-ink { fill: #36190c; } .a-hole { fill: #7a4a2a; }
    .a-stripe { fill: none; stroke: #c4471a; stroke-width: 3; stroke-linecap: round; }
    .a-shine { fill: none; stroke: #fbefd2; stroke-width: 3; stroke-linecap: round; opacity: .8; }
    .a-shine--wide { stroke-width: 6; opacity: .35; }
  </style>
  <defs>${symbol("art-pin")}${symbol("art-ball")}</defs>
  <rect width="512" height="512" fill="#4a2412"/>
  <circle cx="256" cy="256" r="176" fill="#fbefd2" stroke="#e7a336" stroke-width="12"/>
  <use href="#art-pin" x="178" y="104" width="76" height="190" transform="rotate(-16 216 199)"/>
  <use href="#art-pin" x="270" y="104" width="76" height="190" transform="rotate(16 308 199)"/>
  <use href="#art-pin" x="218" y="88" width="80" height="200"/>
  <use href="#art-ball" x="150" y="236" width="150" height="150"/>
</svg>`;

const { chromium } = createRequire(import.meta.url)("playwright");
const browser = await chromium.launch();
const tab = await browser.newPage();
for (const [name, px] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await tab.setViewportSize({ width: px, height: px });
  await tab.setContent(`<style>body{margin:0}svg{display:block;width:${px}px;height:${px}px}</style>${art}`);
  await tab.screenshot({ path: new URL(`public/icons/${name}`, root).pathname, omitBackground: false });
}
await browser.close();
console.log("Wrote public/icons/icon-192.png, icon-512.png, apple-touch-icon.png");
