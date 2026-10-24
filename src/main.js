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
import { aggregate } from "./stats.js";
import { shareResult } from "./share.js";
import { initLive } from "./live-ui.js";
import { initFinalCard, winnerLine } from "./final-card.js";
import { keepAwake as requestWake } from "./wake.js";
import "./components/fk-scan.js";
import "./components/fk-sendoff.js";
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
  splash: $("splash"),
  scan: /** @type {import("./components/fk-scan.js").FkScan} */ ($("scan")),
  scanLive: /** @type {import("./components/fk-scan.js").FkScan} */ ($("scan-live")),
  sendoff: /** @type {import("./components/fk-sendoff.js").FkSendoff} */ ($("sendoff")),
  splashStart: /** @type {HTMLButtonElement} */ ($("splash-start")),
  board: /** @type {import("./components/fk-scoreboard.js").FkScoreboard} */ ($("board")),
  pad: /** @type {import("./components/fk-pinpad.js").FkPinpad} */ ($("pad")),
  skipPad: $("skip-pad"),
  nowName: $("nowup-name"),
  nowDetail: $("nowup-detail"),
  nowUp: $("nowup"),
  editBanner: $("edit-banner"),
  editText: $("edit-text"),
  editCancel: /** @type {HTMLButtonElement} */ ($("edit-cancel")),
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
/** Splash screen until someone taps Start; it returns when a game ends. */
let started = false;

/* ---------- Routing ---------- */
const VIEWS = ["lanes", "leaders", "history"];
/** @type {ReturnType<typeof initLive> | null} */
let live = null;

/** "#watch-KQZP" opens a live lane; "#game-<id>" opens a saved game. @param {string} name @param {boolean} [focus] */
function show(name, focus = false) {
  const watchCode = name.startsWith("watch-") ? normalizeCode(name.slice(6)) : null;
  const gameId = name.startsWith("game-") ? name.slice(5) : null;
  const view = watchCode ? "watch" : gameId ? "history" : VIEWS.includes(name) ? name : "lanes";
  const hash = watchCode ? `watch-${watchCode}` : gameId ? `game-${gameId}` : view;
  // Sections are "view-*" so the route hash never triggers an anchor jump.
  for (const el of ui.views) el.hidden = el.id !== `view-${view}`;
  for (const tab of ui.tabs) tab.setAttribute("aria-current", tab.dataset.view === view ? "page" : "false");
  if (location.hash.slice(1) !== hash) history.replaceState(null, "", `#${hash}`);
  live?.setWatching(watchCode);
  if (focus) $(`${view}-title`).focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  if (gameId) ui.history.focusGame(gameId);
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
  ui.splash.hidden = !!g || started;
  ui.setup.hidden = !!g || !started;
  ui.live.hidden = !g;
  if (!g) return;

  const complete = session.complete;
  const t = session.target;
  ui.scanLive.bowlers = g.bowlers.map((b) => b.name);
  ui.board.bowlers = g.bowlers;
  ui.board.active = complete ? -1 : g.active;
  ui.board.edit = session.edit ? { bowler: session.edit.bowler, frame: session.edit.frame } : null;

  ui.pad.max = session.maxPins;
  ui.pad.fresh = t?.fresh ?? true;
  ui.pad.canUndo = session.canUndo || !!session.edit;
  ui.pad.hidden = complete && !session.edit;
  ui.skipPad.hidden = ui.pad.hidden;
  if (t && !complete) ui.pad.label = `${session.edit ? "Fixing " : ""}${g.bowlers[t.bowler].name} · F${t.frame + 1} · Ball ${t.ball + 1}`;
  else if (t && session.edit) ui.pad.label = `Fixing ${g.bowlers[t.bowler].name} · F${t.frame + 1}`;

  ui.editBanner.hidden = !session.edit;
  if (session.edit && t) ui.editText.textContent = `Fixing ${g.bowlers[t.bowler].name}'s frame ${t.frame + 1} · ball ${t.ball + 1}`;

  ui.nowUp.hidden = complete || !!session.edit;
  if (t && !complete) {
    ui.nowName.textContent = g.bowlers[t.bowler].name;
    ui.nowDetail.textContent = `Frame ${t.frame + 1} · Ball ${t.ball + 1}${t.ball > 0 && t.standing < 10 ? ` · ${t.standing} standing` : ""}`;
  }

  final.render();
  // Photos and send-off need the shared Netlify history and a saved game.
  const saved = complete && store?.kind === "netlify" ? final.saved() : null;
  ui.sendoff.game = saved && (games.find((x) => x.id === saved.id) ?? saved);
}
session.addEventListener("change", renderGame);

ui.pad.addEventListener("fk-roll", (e) => {
  const { pins } = /** @type {CustomEvent<{ pins: number }>} */ (e).detail;
  const g = session.game;
  const who = g ? g.bowlers[g.active].name : "";
  const moment = session.roll(pins);
  if (moment) celebrateMoment(moment, who);
});

/** @param {import("./game.js").Moment} moment @param {string} who */
function celebrateMoment(moment, who) {
  if (moment === "strike") ui.celebrate.show("STRIKE!", "strike");
  else if (moment === "turkey") ui.celebrate.show("TURKEY!", "big");
  else if (moment === "perfect") ui.celebrate.show("PERFECT 300!", "big");
  else if (moment === "spare") ui.celebrate.show("SPARE!", "spare");
  else if (moment === "gutter") ui.celebrate.show(who ? `Gutter, ${who}` : "Gutter ball", "gutter");
  else if (moment === "final") ui.celebrate.show(session.game ? winnerLine(session.game.bowlers) : "Final!", "big");
}
ui.skipPad.addEventListener("click", (e) => {
  e.preventDefault(); // a real jump to #fk-type would reroute the app
  /** @type {HTMLElement | null} */ (ui.pad.querySelector("#fk-type"))?.focus();
});
ui.pad.addEventListener("fk-undo", () => session.undo());
ui.pad.addEventListener("fk-type", (e) => {
  const { text } = /** @type {CustomEvent<{ text: string }>} */ (e).detail;
  const { moment, error } = session.typeMarks(text);
  ui.pad.typed(error);
  if (moment) celebrateMoment(moment, "");
});
ui.board.addEventListener("fk-frame", (e) => {
  const { bowler, frame } = /** @type {CustomEvent<{ bowler: number, frame: number }>} */ (e).detail;
  session.select(bowler, frame);
});
/** Drops the frame fix and puts keyboard focus back on the frame that was being fixed. */
function cancelFix() {
  if (!session.edit) return;
  const { bowler, frame } = session.edit;
  session.cancelEdit();
  ui.board.focusFrame(bowler, frame);
}
ui.editCancel.addEventListener("click", cancelFix);
document.addEventListener("keydown", (e) => e.key === "Escape" && cancelFix());

ui.setup.addEventListener("fk-start", (e) => {
  const { venue, names } = /** @type {CustomEvent<{ venue: string, names: string[] }>} */ (e).detail;
  session.start(venue, names);
  keepAwake();
  showSheet();
});

/** Bring the sheet to the top so the pinned pad (which shows who's up) never hides the scores. */
function showSheet() {
  requestAnimationFrame(() => ui.board.scrollIntoView({ block: "start" }));
}

/** @param {string[]} names @param {string} [venue] */
function rematch(names, venue = "") {
  session.start(venue, names);
  show("lanes");
  showSheet();
  ui.board.focusFrame(0, 0); // the button that started this is gone; don't strand focus on <body>
  toast("New game, same crew. Good luck!");
}
const final = initFinalCard({
  session,
  store: () => store,
  rematch,
  end: () => {
    started = false;
    session.clear();
  },
  toast,
});

ui.scan.addEventListener("fk-scan-load", (e) => {
  const { bowlers } = /** @type {CustomEvent<{ bowlers: Array<{ name: string, frames: number[][] }> }>} */ (e).detail;
  session.load("", bowlers);
  started = true;
  window.scrollTo({ top: 0 });
  toast(session.complete ? "Scores loaded. Check them, then save." : "Scores loaded. Finish the missing frames on the pad.");
});
ui.sendoff.addEventListener("fk-photos-changed", () => store?.refresh());
ui.scanLive.addEventListener("fk-scan-update", (e) => {
  const { updates } = /** @type {CustomEvent<{ updates: Array<{ bowler: number, frames: number[][] }> }>} */ (e).detail;
  const { updated, kept } = session.applyScan(updates);
  showSheet();
  const parts = [updated.length ? `Updated ${updated.join(", ")}` : "Nothing new on the screen", kept.length ? `kept the app's scores for ${kept.join(", ")}` : ""];
  toast(`${parts.filter(Boolean).join("; ")}. Undo reverses it.`);
});

ui.splashStart.addEventListener("click", () => {
  started = true;
  renderGame();
  /** @type {HTMLInputElement | null} */ (document.getElementById("fk-bowler-name"))?.focus();
  window.scrollTo({ top: 0 });
});

/* ---------- History & leaders ---------- */
function renderHistory() {
  ui.leaders.games = games;
  ui.history.games = games;
  const known = aggregate(games)
    .sort((a, b) => b.games - a.games)
    .map((s) => s.name);
  ui.setup.knownNames = known;
  ui.scan.knownNames = known;
  renderGame();
}

ui.history.addEventListener("fk-share", (e) => {
  const { id } = /** @type {CustomEvent<{ id: string }>} */ (e).detail;
  const game = games.find((g) => g.id === id);
  if (game) shareResult(game, store?.kind === "netlify", toast);
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
  if (session.game && !final.saved()) {
    show("lanes");
    toast("Save or end the current game first.");
    return;
  }
  rematch(names);
});

/* ---------- Screen wake lock while bowling ---------- */
const keepAwake = () => requestWake(() => !!session.game && !session.complete);
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
  ui.scan.hidden = s.kind !== "netlify";
  ui.scanLive.hidden = s.kind !== "netlify";
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
