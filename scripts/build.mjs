// Wraps the artifact page (app.html) in a full document for Netlify and bundles the src/
// scripts and stylesheets it references into content-hashed files under dist/assets/.
// It also ships public/ (web app manifest, icons) and dist/sw.js, the offline-shell service worker.
// The Claude artifact keeps loading app.html's unbundled ES modules straight from src/.
import { createHash } from "node:crypto";
import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const page = await readFile(new URL("app.html", root), "utf8");
const srcRef = /\b(src|href)="(src\/[^"]+\.(?:js|css))"/g;
const entries = [...new Set(Array.from(page.matchAll(srcRef), (m) => m[2]))];

const [, headBlock = "", body = page] = page.match(/<!-- head:start -->([\s\S]*?)<!-- head:end -->([\s\S]*)/) ?? [];
// Same reset the Claude artifact skeleton provides, so both hosts render alike.
const reset = `:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}`;
const icon = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#36190c"/><circle cx="24" cy="22" r="5" fill="#e7a336"/><circle cx="38" cy="20" r="5" fill="#e7a336"/><circle cx="33" cy="33" r="5" fill="#e7a336"/></svg>')}`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#4a2412">
<link rel="icon" href="${icon}">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="fk:service-worker" content="/sw.js">
<style>${reset}</style>
${headBlock.trim()}
</head>
<body>
${body.trim()}
</body>
</html>
`;

await rm(dist, { recursive: true, force: true });
// Manifest and icons ship as-is from public/.
await cp(new URL("public/", root), dist, { recursive: true });
const { metafile } = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: entries,
  outdir: "dist/assets",
  entryNames: "[name]-[hash]",
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  metafile: true,
});
const hashed = new Map(Object.entries(metafile.outputs).flatMap(([out, { entryPoint }]) => (entryPoint ? [[entryPoint, out.replace(/^dist\//, "")]] : [])));
await writeFile(new URL("index.html", dist), html.replace(srcRef, (_, attr, url) => `${attr}="${hashed.get(url)}"`));

// The service worker precaches every file this build shipped ("/" is index.html). Its version
// hashes their contents, so a new build changes dist/sw.js and browsers install the new shell.
const shipped = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => relative(fileURLToPath(dist), join(entry.parentPath, entry.name)).split(sep).join("/"))
  .sort();
const version = createHash("sha256");
for (const file of shipped) version.update(file).update(await readFile(new URL(file, dist)));
const files = shipped.map((file) => (file === "index.html" ? "/" : `/${file}`));
const shell = { version: version.digest("hex").slice(0, 16), files };
await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ["src/sw.js"],
  outfile: "dist/sw.js",
  bundle: true,
  minify: true,
  target: "es2022",
  banner: { js: `self.FK_SHELL=${JSON.stringify(shell)};` },
});
console.log(`Built dist/index.html with ${[...hashed.values()].join(", ")}; dist/sw.js precaches ${files.length} files`);
