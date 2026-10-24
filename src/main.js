// @ts-check
/** App shell: routing, wiring components to the game session and the store. */
import "./components/fk-scoreboard.js";
import "./components/fk-pinpad.js";
import "./components/fk-setup.js";
import "./components/fk-leaderboard.js";
import "./components/fk-history.js";
import "./components/fk-celebrate.js";
import { GameSession } from "./game.js";
import { connectStore } from "./store.js";
import { aggregate, gameResults, shareText } from "./stats.js";
import { currentScore } from "./scoring.js";
import { initLive } from "./live-ui.js";
import { normalizeCode } from "./live.js";

/** @typedef {import("./stats.js").SavedGame} SavedGame */
/** @typedef {import("./store.js").GameStore} GameStore */

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @returns {T}
 */
const $ = (id) => /** @type {T} */ (document.getElementById(id));

// Cached once; handlers never query the DOM.
const ui = {
  setup: /** @type {import("./components/fk-setup.js").FkSetup} */ ($("setup")),
  live: $("live"),
  board: /** @type {import("./components/fk-scoreboard.js").FkScoreboard} */ ($("board")),
  pad: /** @type {import("./components/fk-pinpad.js").FkPinpad} */ ($("pad")),
  nowName: $("nowup-name"),
  nowDetail: $("nowup-detail"),
  nowUp: $("nowup"),
  editBanner: $("edit-banner"),
  editText: $("edit-text"),
  editCancel: /** @type {HTMLButtonElement} */ ($("edit-cancel")),
  final: $("final"),
  finalWinner: $("final-winner"),
  saveBtn: /** @type {HTMLButtonElement} */ ($("save-btn")),
  rematchBtn: /** @type {HTMLButtonElement} */ ($("rematch-btn")),
  saveStatus: $("save-status"),
  quitBtn: /** @type {HTMLButtonElement} */ ($("quit-btn")),
  quitConfirm: $("quit-confirm"),
  quitYes: /** @type {HTMLButtonElement} */ ($("quit-yes")),
  quitNo: /** @type {HTMLButtonElement} */ ($("quit-no")),
  leaders: /** @type {import("./components/fk-leaderboard.js").FkLeaderboard} */ ($("leaderboard")),
  history: /** @type {import("./components/fk-history.js").FkHistory} */ ($("history-list")),
  celebrate: /** @type {import("./components/fk-celebrate.js").FkCelebrate} */ ($("celebrate")),
  sync: $("sync"),
  toast: $("toast"),
  tabs: /** @type {HTMLButtonElement[]} */ ([...document.querySelectorAll("[data-view]")]),
  views: /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".view")]),
};

const session = new GameSession();
/** @type {GameStore | null} */
let store = null;
/** @type {SavedGame[]} */
let games = [];
/** @type {string | null} Live game id already saved, so Save can't double-post. */
let savedId = null;

/* ---------- Routing ---------- */
const VIEWS = ["lanes", "leaders", "history"];
/** @type {ReturnType<typeof initLive> | null} */
let live = null;

/** "#watch-KQZP" opens the live view for that lane. @param {string} name @param {boolean} [focus] */
function show(name, focus = false) {
  const watchCode = name.startsWith("watch-") ? normalizeCode(name.slice(6)) : null;
  const view = watchCode ? "watch" : VIEWS.includes(name) ? name : "lanes";
  const hash = watchCode ? `watch-${watchCode}` : view;
  for (const el of ui.views) el.hidden = el.id !== view;
  for (const tab of ui.tabs) tab.setAttribute("aria-current", tab.dataset.view === view ? "page" : "false");
  if (location.hash.slice(1) !== hash) history.replaceState(null, "", `#${hash}`);
  live?.setWatching(watchCode);
  if (focus) $(`${view}-title`).focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}
for (const tab of ui.tabs) tab.addEventListener("click", () => show(tab.dataset.view ?? "lanes", true));
window.addEventListener("hashchange", () => show(location.hash.slice(1)));

/* ---------- Toast ---------- */
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/** @param {string} msg */
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove("is-on"), 2600);
}

/* ---------- Live game rendering ---------- */
function renderGame() {
  const g = session.game;
  ui.setup.hidden = !!g;
  ui.live.hidden = !g;
  if (!g) return;

  const complete = session.complete;
  const t = session.target;
  ui.board.bowlers = g.bowlers;
  ui.board.active = complete ? -1 : g.active;
  ui.board.edit = session.edit ? { bowler: session.edit.bowler, frame: session.edit.frame } : null;

  ui.pad.max = session.maxPins;
  ui.pad.fresh = t?.fresh ?? true;
  ui.pad.canUndo = session.canUndo || !!session.edit;
  ui.pad.hidden = complete && !session.edit;

  ui.editBanner.hidden = !session.edit;
  if (session.edit && t) ui.editText.textContent = `Fixing ${g.bowlers[t.bowler].name}'s frame ${t.frame + 1} · ball ${t.ball + 1}`;

  ui.nowUp.hidden = complete || !!session.edit;
  if (t && !complete) {
    ui.nowName.textContent = g.bowlers[t.bowler].name;
    ui.nowDetail.textContent = `Frame ${t.frame + 1} · Ball ${t.ball + 1}${t.ball > 0 && t.standing < 10 ? ` · ${t.standing} standing` : ""}`;
  }

  ui.final.hidden = !complete;
  if (complete) {
    const scores = g.bowlers.map((b) => ({ name: b.name, total: currentScore(b.frames) }));
    const top = Math.max(...scores.map((s) => s.total));
    const winners = scores.filter((s) => s.total === top).map((s) => s.name);
    ui.finalWinner.textContent =
      scores.length === 1 ? `${winners[0]} rolled a ${top}` : winners.length > 1 ? `${winners.join(" & ")} tie at ${top}` : `${winners[0]} wins with ${top}`;
    const saved = savedId === g.id;
    ui.saveBtn.disabled = saved || !store;
    ui.saveBtn.textContent = saved ? "Saved ✓" : "Save to history";
  }
}
session.addEventListener("change", renderGame);

ui.pad.addEventListener("fk-roll", (e) => {
  const { pins } = /** @type {CustomEvent<{ pins: number }>} */ (e).detail;
  const g = session.game;
  const who = g ? g.bowlers[g.active].name : "";
  const moment = session.roll(pins);
  if (moment === "strike") ui.celebrate.show("STRIKE!", "strike");
  else if (moment === "turkey") ui.celebrate.show("TURKEY!", "big");
  else if (moment === "perfect") ui.celebrate.show("PERFECT 300!", "big");
  else if (moment === "spare") ui.celebrate.show("SPARE!", "spare");
  else if (moment === "gutter") ui.celebrate.show(`Gutter, ${who}`, "gutter");
  else if (moment === "final") ui.celebrate.show(ui.finalWinner.textContent ?? "Final!", "big");
});
ui.pad.addEventListener("fk-undo", () => session.undo());
ui.board.addEventListener("fk-frame", (e) => {
  const { bowler, frame } = /** @type {CustomEvent<{ bowler: number, frame: number }>} */ (e).detail;
  session.select(bowler, frame);
});
ui.editCancel.addEventListener("click", () => session.cancelEdit());

ui.setup.addEventListener("fk-start", (e) => {
  const { venue, names } = /** @type {CustomEvent<{ venue: string, names: string[] }>} */ (e).detail;
  session.start(venue, names);
  savedId = null;
  keepAwake();
});

/** @param {string[]} names @param {string} [venue] */
function rematch(names, venue = "") {
  session.start(venue, names);
  savedId = null;
  show("lanes");
  toast("New game, same crew. Good luck!");
}
ui.rematchBtn.addEventListener("click", () => {
  const g = session.game;
  if (g) rematch(g.bowlers.map((b) => b.name), g.venue);
});

ui.saveBtn.addEventListener("click", async () => {
  const g = session.game;
  if (!g || !store || !session.complete) return;
  ui.saveBtn.disabled = true;
  ui.saveStatus.textContent = "Saving…";
  /** @type {SavedGame} */
  const record = { id: g.id, playedAt: new Date().toISOString(), venue: g.venue, bowlers: g.bowlers.map((b) => ({ name: b.name, frames: b.frames })) };
  try {
    await store.save(record);
    savedId = g.id;
    ui.saveStatus.textContent = store.shared ? "In the books. Everyone can see it in History." : "Saved on this phone.";
    renderGame();
  } catch (err) {
    ui.saveBtn.disabled = false;
    ui.saveStatus.textContent = `Didn't save: ${err instanceof Error ? err.message : "unknown error"}. Tap Save to try again.`;
  }
});

ui.quitBtn.addEventListener("click", () => {
  ui.quitConfirm.hidden = false;
  ui.quitBtn.hidden = true;
  ui.quitNo.focus();
});
ui.quitNo.addEventListener("click", () => {
  ui.quitConfirm.hidden = true;
  ui.quitBtn.hidden = false;
});
ui.quitYes.addEventListener("click", () => {
  const wasSaved = savedId === session.game?.id;
  session.clear();
  ui.quitConfirm.hidden = true;
  ui.quitBtn.hidden = false;
  ui.saveStatus.textContent = "";
  toast(wasSaved ? "Ready for the next game." : "Game cleared.");
});

/* ---------- History & leaders ---------- */
function renderHistory() {
  ui.leaders.games = games;
  ui.history.games = games;
  ui.setup.knownNames = aggregate(games)
    .sort((a, b) => b.games - a.games)
    .map((s) => s.name);
}

ui.history.addEventListener("fk-share", async (e) => {
  const { id } = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  const game = games.find((g) => g.id === id);
  if (!game) return;
  const text = shareText(game);
  try {
    if (navigator.share) {
      await navigator.share({ text, ...(location.protocol.startsWith("http") && !store?.kind.includes("claude") ? { url: `${location.origin}/#history` } : {}) });
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Result copied. Paste it in the group chat.");
  } catch {
    toast(`${gameResults(game)[0].name} won with ${gameResults(game)[0].total}. Copy blocked here.`);
  }
});
ui.history.addEventListener("fk-delete", async (e) => {
  const { id } = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  try {
    await store?.remove(id);
    toast("Game deleted.");
  } catch (err) {
    toast(`Couldn't delete: ${err instanceof Error ? err.message : "try again"}`);
  }
});
ui.history.addEventListener("fk-rematch", (e) => {
  const { names } = /** @type {CustomEvent<{ names: string[] }>} */ (e).detail;
  if (session.game && savedId !== session.game.id) {
    show("lanes");
    toast("Save or end the current game first.");
    return;
  }
  rematch(names);
});

/* ---------- Screen wake lock while bowling ---------- */
/** @type {{ release(): Promise<void> } | null} */
let wakeLock = null;
async function keepAwake() {
  const nav = /** @type {Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }} */ (navigator);
  if (!nav.wakeLock || !session.game || session.complete || wakeLock) return;
  try {
    wakeLock = await nav.wakeLock.request("screen");
    /** @type {EventTarget} */ (/** @type {unknown} */ (wakeLock)).addEventListener?.("release", () => (wakeLock = null));
  } catch {
    wakeLock = null;
  }
}
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && keepAwake());

/* ---------- Boot ---------- */
live = initLive({ session, toast, celebrate: (text, tone) => ui.celebrate.show(text, tone), show });
show(location.hash.slice(1) || "lanes");
renderGame();
renderHistory();
keepAwake();

connectStore().then((s) => {
  store = s;
  ui.sync.textContent = s.label;
  ui.sync.dataset.kind = s.kind;
  live?.setAvailable(s.kind === "netlify");
  ui.sync.title = s.shared ? "Saved games are shared with everyone who opens this app." : "Games stay on this device.";
  renderGame();
  s.watch(
    (list) => {
      games = list;
      renderHistory();
    },
    (msg) => toast(msg),
  );
});
