// @ts-check
/**
 * Live lanes: the scorekeeper's phone publishes the game in progress under a
 * 4-letter code; anyone with the code watches it update. Netlify-only (/api/live).
 */
import { newId } from "./game.js";

/** @typedef {import("./game.js").LiveGame} LiveGame */
/** @typedef {{ code: string, token: string }} ShareState */
/** @typedef {{ game: LiveGame, updatedAt: string }} LiveSnapshot */

const API = "/api/live/";
const SHARE_KEY = "frame-keeper:share";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O: easy to read aloud
export const POLL_MS = 2000;
/** An ended lane rarely comes back: check it less often. */
const GONE_POLL_MS = 10000;

/** @returns {string} */
const randomCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => LETTERS[b % LETTERS.length]).join("");
};

/**
 * @param {string} raw
 * @returns {string | null} Normalized code, or null if it can't be one.
 */
export function normalizeCode(raw) {
  const code = raw.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return /^[A-HJ-NP-Z]{4}$/.test(code) ? code : null;
}

/** @param {string} code @returns {string} */
export const watchUrl = (code) => `${location.origin}${location.pathname}#watch-${code}`;

/**
 * @param {Response} res
 * @returns {Promise<string>}
 */
const errorText = async (res) => {
  try {
    return (await res.json()).error ?? `Server said ${res.status}`;
  } catch {
    return `Server said ${res.status}`;
  }
};

/** Scorekeeper side: owns a lane code and pushes every change. */
export class LiveHost {
  /** @type {ShareState | null} */
  state = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer;
  /** @type {LiveGame | null} */
  #pending = null;
  #sending = false;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(SHARE_KEY) ?? "null");
      if (saved && normalizeCode(saved.code ?? "") && typeof saved.token === "string") this.state = saved;
    } catch {
      /* not sharing */
    }
  }

  /**
   * Claim a fresh code and publish the game. Retries on the rare code collision.
   * @param {LiveGame} game
   * @returns {Promise<string>} The lane code.
   */
  async start(game) {
    const token = newId() + newId() + newId();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const res = await this.#put(code, token, game);
      if (res.ok) {
        this.#save({ code, token });
        return code;
      }
      if (res.status !== 409) throw new Error(await errorText(res));
    }
    throw new Error("Couldn't find a free lane code. Try again.");
  }

  /**
   * Coalesce rapid taps into one request; the latest state always wins.
   * @param {LiveGame} game
   * @returns {void}
   */
  push(game) {
    if (!this.state) return;
    this.#pending = game;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#flush(), 250);
  }

  /** @returns {Promise<void>} */
  async stop() {
    const s = this.state;
    clearTimeout(this.#timer);
    this.#pending = null;
    this.#save(null);
    if (!s) return;
    try {
      await fetch(API + s.code, { method: "DELETE", headers: { "x-live-token": s.token } });
    } catch {
      /* it expires on its own */
    }
  }

  async #flush() {
    if (this.#sending || !this.#pending || !this.state) return;
    const game = this.#pending;
    this.#pending = null;
    this.#sending = true;
    try {
      const res = await this.#put(this.state.code, this.state.token, game);
      // The lane expired or was claimed elsewhere: stop quietly rather than fight over it.
      if (res.status === 409 || res.status === 401) this.#save(null);
    } catch {
      this.#pending ??= game; // offline blip: resend with the next change
    } finally {
      this.#sending = false;
      if (this.#pending) this.#flush();
    }
  }

  /**
   * @param {string} code
   * @param {string} token
   * @param {LiveGame} game
   * @returns {Promise<Response>}
   */
  #put(code, token, game) {
    const body = JSON.stringify({ id: game.id, venue: game.venue, active: game.active, bowlers: game.bowlers });
    return fetch(API + code, { method: "PUT", headers: { "content-type": "application/json", "x-live-token": token }, body });
  }

  /** @param {ShareState | null} state */
  #save(state) {
    this.state = state;
    try {
      if (state) localStorage.setItem(SHARE_KEY, JSON.stringify(state));
      else localStorage.removeItem(SHARE_KEY);
    } catch {
      /* sharing still works for this page load */
    }
    this.onChange?.(state);
  }

  /** @type {((state: ShareState | null) => void) | undefined} */
  onChange;
}

/**
 * Watcher side: poll a lane while the page is visible.
 * @param {string} code
 * @param {{ onUpdate: (snap: LiveSnapshot) => void, onGone: () => void, onError: (msg: string) => void }} handlers
 * @returns {() => void} Stop watching.
 */
export function watchLane(code, { onUpdate, onGone, onError }) {
  let stopped = false;
  let last = "";
  let gone = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === "visible") {
      try {
        const res = await fetch(API + code, { cache: "no-store", headers: { accept: "application/json" } });
        if (res.status === 404) {
          gone = true;
          onGone();
        } else if (!res.ok) onError(await errorText(res));
        else {
          gone = false;
          const snap = /** @type {LiveSnapshot} */ (await res.json());
          if (snap.updatedAt !== last) {
            last = snap.updatedAt;
            onUpdate(snap);
          }
        }
      } catch {
        onError("Lost signal. Retrying…");
      }
    }
    if (!stopped) timer = setTimeout(tick, gone ? GONE_POLL_MS : POLL_MS);
  };
  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
