import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const HASHED = /^assets\/[\w-]+-[A-Z0-9]{8}\.(js|css)$/;

let html = "";
before(async () => {
  await promisify(execFile)(process.execPath, ["scripts/build.mjs"], { cwd: root });
  html = await readFile(new URL("index.html", dist), "utf8");
});

/** Local URLs the page loads via <script src> and <link rel=stylesheet href>. */
function localAssets(page) {
  const scripts = [...page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const styles = [...page.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const local = (/** @type {string} */ u) => !/^(https?:)?\/\//.test(u);
  return { scripts: scripts.filter(local), styles: styles.filter(local) };
}

test("dist/index.html loads at most 2 hashed scripts and 1 hashed stylesheet that exist", () => {
  const { scripts, styles } = localAssets(html);
  assert.ok(scripts.length >= 1 && scripts.length <= 2, `scripts: ${scripts}`);
  assert.equal(styles.length, 1, `styles: ${styles}`);
  for (const url of [...scripts, ...styles]) {
    assert.match(url, HASHED);
    assert.ok(existsSync(new URL(url, dist)), `${url} missing from dist/`);
  }
});

test("dist/ no longer ships the unbundled src/ modules", () => {
  assert.doesNotMatch(html, /["']\/?src\//);
  assert.equal(existsSync(new URL("src/", dist)), false);
});

/** Cache-Control value per `for` path from netlify.toml's [[headers]] blocks. */
async function cacheControlByPath() {
  const toml = await readFile(new URL("netlify.toml", root), "utf8");
  return new Map(toml.split("[[headers]]").slice(1).flatMap((block) => {
    const path = block.match(/^\s*for\s*=\s*"([^"]+)"/m)?.[1];
    const value = block.match(/^\s*Cache-Control\s*=\s*"([^"]+)"/m)?.[1];
    return path && value ? [[path, value]] : [];
  }));
}

test("netlify.toml caches hashed assets for a year and makes HTML revalidate", async () => {
  const headers = await cacheControlByPath();
  const assetDirs = new Set(Object.values(localAssets(html)).flat().map((url) => url.split("/")[0]));
  for (const dir of assetDirs) assert.equal(headers.get(`/${dir}/*`), "public, max-age=31536000, immutable");
  for (const page of ["/", "/index.html"]) assert.equal(headers.get(page), "public, max-age=0, must-revalidate");
  assert.equal(headers.has("/*"), false, "a catch-all Cache-Control would merge into the hashed assets' header");
});

test("app.html (the Claude artifact) still loads the unbundled ES modules from src/", async () => {
  const page = await readFile(new URL("app.html", root), "utf8");
  assert.match(page, /<script type="module" src="src\/main\.js"><\/script>/);
  const { scripts, styles } = localAssets(page);
  for (const url of [...scripts, ...styles]) {
    assert.match(url, /^src\//);
    assert.ok(existsSync(new URL(url, root)), `${url} missing`);
  }
});
