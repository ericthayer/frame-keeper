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

/** href of the first <link> whose rel attribute is exactly `rel`. */
function linkHref(page, rel) {
  const tag = [...page.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]).find((t) => t.includes(`rel="${rel}"`));
  return tag?.match(/\bhref="([^"]+)"/)?.[1];
}

/** Width and height from a PNG file's IHDR chunk; throws if the file is not a PNG. */
async function pngSize(url) {
  const buf = await readFile(new URL(url.replace(/^\//, ""), dist));
  assert.equal(buf.subarray(1, 4).toString("latin1"), "PNG", `${url} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test("dist/index.html links an installable manifest with 192px and 512px PNG icons", async () => {
  const href = linkHref(html, "manifest");
  assert.ok(href, "no <link rel=manifest>");
  const manifest = JSON.parse(await readFile(new URL(href.replace(/^\//, ""), dist), "utf8"));
  assert.equal(manifest.name, "Frame Keeper");
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  for (const px of [192, 512]) {
    const icon = manifest.icons.find((/** @type {{ sizes: string }} */ i) => i.sizes === `${px}x${px}`);
    assert.ok(icon, `no ${px}px icon`);
    assert.equal(icon.type, "image/png");
    assert.deepEqual(await pngSize(icon.src), { width: px, height: px });
  }
});

test("dist/index.html links an apple-touch-icon PNG", async () => {
  const href = linkHref(html, "apple-touch-icon");
  assert.ok(href, "no <link rel=apple-touch-icon>");
  const { width } = await pngSize(href);
  assert.ok(width >= 180, `apple-touch-icon is ${width}px`);
});

test("dist/sw.js precaches this build's page, hashed assets, manifest and icons", async () => {
  const sw = await readFile(new URL("sw.js", dist), "utf8");
  const files = JSON.parse(sw.match(/self\.FK_SHELL=(\{.*?\});/)?.[1] ?? "null")?.files;
  assert.ok(Array.isArray(files), "sw.js has no precache list");
  const { scripts, styles } = localAssets(html);
  const expected = ["/", ...[...scripts, ...styles].map((u) => `/${u}`), linkHref(html, "manifest"), linkHref(html, "apple-touch-icon")];
  for (const file of expected) assert.ok(files.includes(file), `${file} not precached`);
  for (const file of files) assert.ok(existsSync(new URL(file === "/" ? "index.html" : file.slice(1), dist)), `${file} missing from dist/`);
});

test("only the Netlify build registers the service worker, and it is never cached as immutable", async () => {
  assert.match(html, /<meta name="fk:service-worker" content="\/sw\.js">/);
  const artifact = await readFile(new URL("app.html", root), "utf8");
  assert.doesNotMatch(artifact, /fk:service-worker|rel="manifest"/);
  const headers = await cacheControlByPath();
  for (const path of ["/sw.js", "/manifest.webmanifest"]) assert.equal(headers.get(path), "public, max-age=0, must-revalidate");
});
