// @ts-check
/** Final card and End game: every way out of a finished game, guarded so no single tap discards an unsaved one. */
import { currentScore } from "./scoring.js";

/** @typedef {import("./game.js").GameSession} GameSession */
/** @typedef {import("./game.js").LiveBowler} LiveBowler */
/** @typedef {import("./stats.js").SavedGame} SavedGame */
/** @typedef {import("./store.js").GameStore} GameStore */

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {LiveBowler[]} bowlers */
export function winnerLine(bowlers) {
  const scores = bowlers.map((b) => ({ name: b.name, total: currentScore(b.frames) }));
  const top = Math.max(...scores.map((s) => s.total));
  const winners = scores.filter((s) => s.total === top).map((s) => s.name);
  if (scores.length === 1) return `${winners[0]} rolled a ${top}`;
  return winners.length > 1 ? `${winners.join(" & ")} tie at ${top}` : `${winners[0]} wins with ${top}`;
}

/**
 * @param {{
 *   session: GameSession,
 *   store: () => GameStore | null,
 *   rematch: (names: string[], venue: string) => void,
 *   end: () => void,
 *   toast: (msg: string) => void,
 * }} deps
 * @returns {{ render: () => void, saved: () => SavedGame | null }}
 */
export function initFinalCard({ session, store, rematch, end, toast }) {
  const el = {
    card: byId("final"),
    winner: byId("final-winner"),
    save: /** @type {HTMLButtonElement} */ (byId("save-btn")),
    rematch: /** @type {HTMLButtonElement} */ (byId("rematch-btn")),
    status: byId("save-status"),
    quit: /** @type {HTMLButtonElement} */ (byId("quit-btn")),
    confirm: byId("quit-confirm"),
    confirmText: byId("quit-text"),
    yes: /** @type {HTMLButtonElement} */ (byId("quit-yes")),
    no: /** @type {HTMLButtonElement} */ (byId("quit-no")),
  };
  /** @type {SavedGame | null} The live game's record once saved; a new game has a new id, so it never matches. */
  let record = null;
  let saving = false;
  /** Status line, tied to the game it describes so it never carries over to the next one. */
  let status = { id: "", text: "" };

  const saved = () => (record && record.id === session.game?.id ? record : null);

  /** @param {string} text */
  function setStatus(text) {
    status = { id: session.game?.id ?? "", text };
    render();
  }

  function render() {
    const g = session.game;
    el.card.hidden = !session.complete;
    if (!g || !session.complete) return;
    el.winner.textContent = winnerLine(g.bowlers);
    const isSaved = !!saved();
    el.save.disabled = isSaved || saving || !store();
    el.save.textContent = isSaved ? "Saved ✓" : "Save to history";
    el.rematch.disabled = !isSaved && (saving || !store());
    el.rematch.textContent = isSaved ? "Rematch" : "Save & rematch";
    el.status.textContent = status.id === g.id ? status.text : "";
  }

  /** Saves the finished game; resolves whether it's now in the books. */
  async function save() {
    const g = session.game;
    const s = store();
    if (!g || !s || !session.complete || saving) return false;
    saving = true;
    setStatus("Saving…");
    /** @type {SavedGame} */
    const next = { id: g.id, playedAt: new Date().toISOString(), venue: g.venue, bowlers: g.bowlers.map((b) => ({ name: b.name, frames: b.frames })) };
    let text;
    try {
      await s.save(next);
      record = next;
      text = s.shared ? "In the books. Everyone can see it in History." : "Saved on this phone.";
    } catch (err) {
      text = `Didn't save: ${err instanceof Error ? err.message : "unknown error"}. Tap Save to try again.`;
    }
    saving = false;
    setStatus(text);
    return record === next;
  }

  el.save.addEventListener("click", () => save());
  el.rematch.addEventListener("click", async () => {
    const g = session.game;
    if (!g || (!saved() && !(await save()))) return;
    rematch(g.bowlers.map((b) => b.name), g.venue);
  });

  el.quit.addEventListener("click", () => {
    el.confirmText.textContent = saved() ? "End this game? It's safe in History." : "End this game? Unsaved scores are lost.";
    el.confirm.hidden = false;
    el.quit.hidden = true;
    el.no.focus();
  });
  el.no.addEventListener("click", () => {
    el.confirm.hidden = true;
    el.quit.hidden = false;
  });
  el.yes.addEventListener("click", () => {
    const wasSaved = !!saved();
    end();
    el.confirm.hidden = true;
    el.quit.hidden = false;
    toast(wasSaved ? "Ready for the next game." : "Game cleared.");
  });

  return { render, saved };
}
