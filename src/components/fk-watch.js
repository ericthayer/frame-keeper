// @ts-check
/**
 * <fk-watch> — read-only live view of someone else's lane.
 * Property: code (4 letters, or "" to stop).
 * Events: "fk-moment" {text, tone} for celebrations, "fk-unwatch".
 */
import { h, emit } from "../dom.js";
import { watchLane } from "../live.js";
import { lastBallMoment } from "../game.js";
import { currentFrameIndex, currentScore, isGameComplete } from "../scoring.js";
import "./fk-scoreboard.js";

/** @typedef {import("../live.js").LiveSnapshot} LiveSnapshot */

/** @type {Record<string, [string, import("./fk-celebrate.js").Tone]>} */
const MOMENTS = { strike: ["STRIKE!", "strike"], turkey: ["TURKEY!", "big"], perfect: ["PERFECT 300!", "big"], spare: ["SPARE!", "spare"] };

export class FkWatch extends HTMLElement {
  #code = "";
  /** @type {(() => void) | null} */
  #stop = null;
  /** @type {LiveSnapshot | null} */
  #snap = null;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  #clock;
  #els = /** @type {{ status: HTMLElement, now: HTMLElement, board: import("./fk-scoreboard.js").FkScoreboard, final: HTMLElement, venue: HTMLElement, title: HTMLElement } | null} */ (null);

  /** @param {string} v */
  set code(v) {
    if (v === this.#code) return;
    this.#code = v;
    this.#snap = null;
    this.#stop?.();
    this.#stop = null;
    if (this.isConnected) this.#begin();
  }

  connectedCallback() {
    this.classList.add("watch");
    if (!this.#els) this.#build();
    this.#begin();
    this.#clock = setInterval(() => this.#renderStatus(), 1000);
  }

  disconnectedCallback() {
    this.#stop?.();
    this.#stop = null;
    clearInterval(this.#clock);
  }

  #build() {
    const board = /** @type {import("./fk-scoreboard.js").FkScoreboard} */ (document.createElement("fk-scoreboard"));
    board.setAttribute("aria-label", "Live scoreboard");
    board.readonly = true;
    this.#els = {
      title: h("p", { class: "live-chip", "aria-hidden": "true" }),
      venue: h("p", { class: "view__sub" }),
      now: h("p", { class: "nowup", "aria-live": "polite" }),
      board,
      final: h("p", { class: "final__winner watch__final" }),
      status: h("p", { class: "watch__status", role: "status" }),
    };
    const e = this.#els;
    this.append(
      h("div", { class: "watch__head" }, e.title, h("button", { type: "button", class: "btn btn--small btn--ghost", text: "Stop watching", onclick: () => emit(this, "fk-unwatch", null) })),
      e.venue, e.now, e.board, e.final, e.status,
    );
  }

  #begin() {
    if (!this.#code || this.#stop) return;
    this.#render();
    this.#stop = watchLane(this.#code, {
      onUpdate: (snap) => {
        this.#celebrate(this.#snap, snap);
        this.#snap = snap;
        this.#render();
      },
      onGone: () => {
        this.#snap = null;
        this.#render("This lane isn't live. The game may have ended, or check the code.");
      },
      onError: (msg) => this.#renderStatus(msg),
    });
  }

  /**
   * Celebrate on watchers' phones too: find the bowler who just threw.
   * @param {LiveSnapshot | null} prev
   * @param {LiveSnapshot} next
   */
  #celebrate(prev, next) {
    if (!prev || prev.game.id !== next.game.id) return;
    next.game.bowlers.forEach((b, i) => {
      const before = prev.game.bowlers[i]?.frames.flat().length ?? 0;
      if (b.frames.flat().length !== before + 1) return;
      const m = lastBallMoment(b.frames);
      if (m && MOMENTS[m]) emit(this, "fk-moment", { text: `${MOMENTS[m][0]} ${b.name}`, tone: MOMENTS[m][1] });
    });
  }

  /** @param {string} [message] */
  #render(message) {
    const e = this.#els;
    if (!e) return;
    const g = this.#snap?.game;
    e.title.textContent = `LIVE · Lane ${this.#code}`;
    e.board.hidden = !g;
    e.now.hidden = !g;
    e.final.hidden = true;
    e.venue.textContent = g?.venue ?? "";
    e.venue.hidden = !g?.venue;
    if (!g) {
      this.#renderStatus(message ?? "Connecting to the lane…");
      return;
    }
    const done = g.bowlers.every((b) => isGameComplete(b.frames));
    e.board.bowlers = g.bowlers;
    e.board.active = done ? -1 : g.active;
    if (done) {
      const scores = g.bowlers.map((b) => ({ name: b.name, total: currentScore(b.frames) }));
      const top = Math.max(...scores.map((s) => s.total));
      const winners = scores.filter((s) => s.total === top).map((s) => s.name);
      e.final.hidden = false;
      e.now.hidden = true;
      e.final.textContent = winners.length > 1 ? `${winners.join(" & ")} tie at ${top}` : `${winners[0]} wins with ${top}`;
    } else {
      const up = g.bowlers[g.active];
      const f = currentFrameIndex(up.frames);
      e.now.replaceChildren(
        h("span", { class: "nowup__label", text: "Up now" }),
        h("strong", { class: "nowup__name", text: up.name }),
        h("span", { class: "nowup__detail", text: `Frame ${f + 1}` }),
      );
    }
    this.#renderStatus();
  }

  /** @param {string} [message] */
  #renderStatus(message) {
    const e = this.#els;
    if (!e) return;
    if (message) {
      e.status.textContent = message;
      return;
    }
    if (!this.#snap) return;
    const secs = Math.max(0, Math.round((Date.now() - Date.parse(this.#snap.updatedAt)) / 1000));
    e.status.textContent = secs < 5 ? "Updated just now" : secs < 60 ? `Updated ${secs}s ago` : `Updated ${Math.round(secs / 60)} min ago`;
  }
}

customElements.define("fk-watch", FkWatch);
