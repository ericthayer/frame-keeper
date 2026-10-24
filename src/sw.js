// @ts-check
/**
 * Service worker for the Netlify build: precaches the app shell so the app opens with no signal.
 * scripts/build.mjs bundles this file to dist/sw.js and prepends `self.FK_SHELL`, the list of files
 * that build shipped plus a version hash, so every new build installs a fresh worker and cache.
 * Requests to /api/* are never answered here, so scores and history always come from the network.
 */

/** @typedef {Event & { waitUntil(p: Promise<unknown>): void }} ExtendableEvent */
/** @typedef {ExtendableEvent & { request: Request, respondWith(r: Response | Promise<Response>): void }} FetchEvent */
/**
 * @typedef {object} WorkerScope
 * @property {{ version: string, files: string[] }} FK_SHELL
 * @property {Location} location
 * @property {() => Promise<void>} skipWaiting
 * @property {{ claim(): Promise<void> }} clients
 * @property {(type: string, listener: (event: any) => void) => void} addEventListener
 */

const worker = /** @type {WorkerScope} */ (/** @type {unknown} */ (self));
const SHELL = `fk-shell-${worker.FK_SHELL.version}`;
const FONTS = "fk-fonts";
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

worker.addEventListener("install", (/** @type {ExtendableEvent} */ event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(worker.FK_SHELL.files)).then(() => worker.skipWaiting()));
});

worker.addEventListener("activate", (/** @type {ExtendableEvent} */ event) => {
  const stale = (/** @type {string} */ name) => name.startsWith("fk-shell-") && name !== SHELL;
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names.filter(stale).map((name) => caches.delete(name))))
    .then(() => worker.clients.claim()));
});

worker.addEventListener("fetch", (/** @type {FetchEvent} */ event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const local = url.origin === worker.location.origin;
  if (local && url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") event.respondWith(pageOrShell(request));
  else if (local) event.respondWith(cachedOrNetwork(request));
  else if (FONT_HOSTS.has(url.hostname)) event.respondWith(cachedFont(request));
});

/** Pages come fresh from the network; with no signal the cached shell stands in. @param {Request} request */
async function pageOrShell(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const shell = await caches.match("/", { cacheName: SHELL });
    if (shell) return shell;
    throw err;
  }
}

/** @param {Request} request */
async function cachedOrNetwork(request) {
  return (await caches.match(request, { cacheName: SHELL })) ?? fetch(request);
}

/** Web fonts are cached the first time they load, then served from the cache. @param {Request} request */
async function cachedFont(request) {
  const cache = await caches.open(FONTS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  return response;
}
