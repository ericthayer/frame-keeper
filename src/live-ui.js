// @ts-check
/** Wires live-lane sharing (scorekeeper) and watching (everyone else) into the app shell. */
import "./components/fk-watch.js";
import { LiveHost, normalizeCode, watchUrl } from "./live.js";

/** @typedef {import("./game.js").GameSession} GameSession */
/** @typedef {import("./components/fk-celebrate.js").Tone} Tone */

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * @param {{
 *   session: GameSession,
 *   toast: (msg: string) => void,
 *   celebrate: (text: string, tone: Tone) => void,
 *   show: (name: string, focus?: boolean) => void,
 * }} deps
 * @returns {{ setAvailable: (on: boolean) => void, setWatching: (code: string | null) => void }}
 */
export function initLive({ session, toast, celebrate, show }) {
  const el = {
    share: byId("share"),
    start: /** @type {HTMLButtonElement} */ (byId("share-start")),
    panel: byId("share-panel"),
    code: byId("share-code"),
    send: /** @type {HTMLButtonElement} */ (byId("share-send")),
    stop: /** @type {HTMLButtonElement} */ (byId("share-stop")),
    watchForm: /** @type {HTMLFormElement} */ (byId("watch-form")),
    watchInput: /** @type {HTMLInputElement} */ (byId("watch-code")),
    watchHint: byId("watch-hint"),
    watcher: /** @type {import("./components/fk-watch.js").FkWatch} */ (byId("watcher")),
  };
  const host = new LiveHost();
  let available = false;

  const render = () => {
    const sharing = !!host.state;
    el.share.hidden = !available || !session.game;
    el.start.hidden = sharing;
    el.panel.hidden = !sharing;
    if (host.state) el.code.textContent = host.state.code;
    el.watchForm.hidden = !available || !!session.game;
  };
  host.onChange = render;

  session.addEventListener("change", () => {
    if (host.state && session.game) host.push(session.game);
    else if (host.state && !session.game) host.stop();
    render();
  });

  el.start.addEventListener("click", async () => {
    if (!session.game) return;
    el.start.disabled = true;
    try {
      const code = await host.start(session.game);
      toast(`Lane ${code} is live. Send the link to the crew.`);
    } catch (err) {
      toast(`Couldn't go live: ${err instanceof Error ? err.message : "try again"}`);
    } finally {
      el.start.disabled = false;
      render();
    }
  });

  el.send.addEventListener("click", async () => {
    if (!host.state) return;
    const url = watchUrl(host.state.code);
    const text = `Follow our game live on lane ${host.state.code}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Frame Keeper", text, url });
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text}: ${url}`);
      toast("Watch link copied.");
    } catch {
      toast(`Share this link: ${url}`);
    }
  });

  el.stop.addEventListener("click", async () => {
    await host.stop();
    toast("Stopped sharing. Watchers see the lane close.");
  });

  el.watchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = normalizeCode(el.watchInput.value);
    if (!code) {
      el.watchHint.textContent = "Lane codes are 4 letters, like KQZP.";
      el.watchInput.focus();
      return;
    }
    el.watchHint.textContent = "";
    el.watchInput.value = "";
    show(`watch-${code}`, true);
  });

  el.watcher.addEventListener("fk-moment", (e) => {
    const { text, tone } = /** @type {CustomEvent<{ text: string, tone: Tone }>} */ (e).detail;
    celebrate(text, tone);
  });
  el.watcher.addEventListener("fk-unwatch", () => show("lanes", true));

  render();
  return {
    setAvailable(on) {
      available = on;
      render();
      // Resume pushing after a refresh mid-game.
      if (on && host.state && session.game) host.push(session.game);
    },
    setWatching(code) {
      el.watcher.code = code ?? "";
    },
  };
}
