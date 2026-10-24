// @ts-check
/**
 * Storage adapters behind one interface:
 *  - "claude":  shared db when running as a Claude artifact
 *  - "netlify": /api/games (Netlify Function + Blobs) on the deployed site
 *  - "local":   this device only (offline / file preview)
 */
import { parseGame } from "./stats.js";

/** @typedef {import("./stats.js").SavedGame} SavedGame */
/** @typedef {"claude" | "netlify" | "local"} StoreKind */

/**
 * @typedef {Object} GameStore
 * @property {StoreKind} kind
 * @property {string} label           Human label for the sync badge.
 * @property {boolean} shared         True when other people see the same history.
 * @property {(onChange: (games: SavedGame[]) => void, onError: (msg: string) => void) => () => void} watch
 * @property {(game: SavedGame) => Promise<void>} save
 * @property {(id: string) => Promise<void>} remove
 * @property {() => Promise<void>} refresh  Re-read history now (after photo changes).
 */

/**
 * @param {unknown[]} raw
 * @returns {SavedGame[]}
 */
const clean = (raw) =>
  raw
    .map(parseGame)
    .filter(/** @returns {g is SavedGame} */ (g) => g !== null)
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt));

/**
 * @typedef {{ get(): Promise<{ docs: Array<{ data(): unknown }> }>, onSnapshot(next: (s: { docs: Array<{ data(): unknown }> }) => void, err: (e: { code: string, message: string }) => void): () => void }} DbQuery
 * @typedef {{ collection(path: string): DbQuery & { doc(id: string): { set(d: object): Promise<void>, delete(): Promise<void> }, orderBy(f: string, d: string): { limit(n: number): DbQuery } } }} ClaudeDb
 */

/**
 * @param {ClaudeDb} db
 * @returns {GameStore}
 */
function claudeStore(db) {
  const games = db.collection("games");
  return {
    kind: "claude",
    label: "Synced in Claude",
    shared: true,
    watch(onChange, onError) {
      return games.orderBy("playedAt", "desc").limit(1000).onSnapshot(
        (snap) => onChange(clean(snap.docs.map((d) => d.data()))),
        (e) => onError(e.code === "revoked" ? "Sync access ended. Reload to reconnect." : `Live sync stopped (${e.code}).`),
      );
    },
    save: (game) => games.doc(game.id).set({ ...game }),
    remove: (id) => games.doc(id).delete(),
    refresh: async () => {},
  };
}

const API = "/api/games";

/** @returns {GameStore} */
function netlifyStore() {
  /** @param {Response} res */
  const check = async (res) => {
    if (!res.ok) throw new Error((await res.text()) || `Server said ${res.status}`);
  };
  return {
    kind: "netlify",
    label: "Synced to the lanes",
    shared: true,
    watch(onChange, onError) {
      let stopped = false;
      const pull = async () => {
        try {
          const res = await fetch(API, { headers: { accept: "application/json" }, cache: "no-store" });
          await check(res);
          const body = await res.json();
          if (!stopped) onChange(clean(Array.isArray(body.games) ? body.games : []));
        } catch (e) {
          if (!stopped) onError(`Couldn't load history. ${e instanceof Error ? e.message : ""}`.trim());
        }
      };
      pull();
      const timer = setInterval(() => document.visibilityState === "visible" && pull(), 20000);
      const onVisible = () => document.visibilityState === "visible" && pull();
      document.addEventListener("visibilitychange", onVisible);
      refreshNow = pull;
      return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisible);
      };
    },
    async save(game) {
      await check(await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(game) }));
      await refreshNow();
    },
    async remove(id) {
      await check(await fetch(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" }));
      await refreshNow();
    },
    refresh: () => refreshNow(),
  };
}
/** @type {() => Promise<void>} */
let refreshNow = async () => {};

const LOCAL_KEY = "frame-keeper:games";

/** @returns {GameStore} */
function localStore() {
  /** @type {(games: SavedGame[]) => void} */
  let notify = () => {};
  /** @returns {unknown[]} */
  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  /** @param {unknown[]} list */
  const write = (list) => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    } catch {
      throw new Error("This browser blocked saving. Try a non-private window.");
    }
    notify(clean(list));
  };
  return {
    kind: "local",
    label: "Saved on this phone",
    shared: false,
    watch(onChange) {
      notify = onChange;
      onChange(clean(read()));
      return () => (notify = () => {});
    },
    async save(game) {
      write([...read().filter((g) => parseGame(g)?.id !== game.id), game]);
    },
    async remove(id) {
      write(read().filter((g) => parseGame(g)?.id !== id));
    },
    refresh: async () => {},
  };
}

/**
 * @template T
 * @param {Promise<T>} p
 * @param {number} ms
 * @returns {Promise<T | null>}
 */
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]).then((v) => /** @type {T | null} */ (v));

/**
 * Pick the best backend available in this environment.
 * @returns {Promise<GameStore>}
 */
export async function connectStore() {
  const host = /** @type {{ claude?: { use?: (n: string) => Promise<unknown> } }} */ (/** @type {unknown} */ (window)).claude;
  if (typeof host?.use === "function") {
    const db = await withTimeout(host.use("db"), 10000).catch(() => null);
    if (db) return claudeStore(/** @type {ClaudeDb} */ (db));
    return localStore();
  }
  if (location.protocol.startsWith("http")) {
    const probe = await withTimeout(fetch(API, { headers: { accept: "application/json" } }), 6000).catch(() => null);
    if (probe?.ok && probe.headers.get("content-type")?.includes("json")) return netlifyStore();
  }
  return localStore();
}
