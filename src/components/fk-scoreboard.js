// @ts-check
/**
 * <fk-scoreboard> — overhead-monitor style score sheet.
 * Properties: bowlers, active (index | -1), edit ({bowler, frame} | null), readonly.
 * Events: "fk-frame" {bowler, frame} when a frame cell is tapped.
 */
import { scoreFrames, currentScore, maxPossible, isGameComplete, FRAME_COUNT } from "../scoring.js";
import { h, emit } from "../dom.js";

/** @typedef {{ name: string, frames: number[][], won?: boolean }} BoardBowler */

export class FkScoreboard extends HTMLElement {
  /** @type {BoardBowler[]} */
  #bowlers = [];
  #active = -1;
  /** @type {{ bowler: number, frame: number } | null} */
  #edit = null;
  #readonly = false;
  #queued = false;

  /** @param {BoardBowler[]} v */
  set bowlers(v) {
    this.#bowlers = v;
    this.#schedule();
  }
  /** @param {number} v */
  set active(v) {
    this.#active = v;
    this.#schedule();
  }
  /** @param {{ bowler: number, frame: number } | null} v */
  set edit(v) {
    this.#edit = v;
    this.#schedule();
  }
  /** @param {boolean} v */
  set readonly(v) {
    this.#readonly = v;
    this.#schedule();
  }

  connectedCallback() {
    this.classList.add("board");
    this.#schedule();
  }

  /** Batch property sets into one render per frame. */
  #schedule() {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.isConnected) this.#render();
    });
  }

  #render() {
    const label = this.getAttribute("aria-label") ?? "Scoreboard";
    const head = h(
      "tr",
      {},
      h("th", { scope: "col", class: "board__name-h", text: "Bowler" }),
      Array.from({ length: FRAME_COUNT }, (_, i) => h("th", { scope: "col", class: i === 9 ? "is-tenth" : "", text: i + 1 })),
      h("th", { scope: "col", class: "board__total-h", text: "Total" }),
    );
    const rows = this.#bowlers.map((b, bi) => this.#row(b, bi));
    const table = h("table", { class: "board__table" }, h("caption", { class: "sr-only", text: label }), h("thead", {}, head), h("tbody", {}, rows));
    const scroller = h("div", { class: "board__scroll", tabindex: 0, role: "region", "aria-label": label }, table);
    this.replaceChildren(scroller);
    // Keep the frame in play visible on narrow screens.
    if (!this.#readonly) {
      requestAnimationFrame(() => {
        const cell = /** @type {HTMLElement | null} */ (this.querySelector(".is-now, .is-editing"));
        if (cell) scroller.scrollLeft = Math.max(0, cell.offsetLeft - scroller.clientWidth / 2 + cell.offsetWidth);
      });
    }
  }

  /**
   * @param {BoardBowler} b
   * @param {number} bi
   * @returns {HTMLTableRowElement}
   */
  #row(b, bi) {
    const views = scoreFrames(b.frames);
    const done = isGameComplete(b.frames);
    const isUp = bi === this.#active && !done;
    const nowFrame = views.findIndex((v) => !v.complete);
    const nameCell = h(
      "th",
      { scope: "row", class: "board__name" },
      this.#readonly
        ? h("span", { class: "board__who" }, b.won ? h("span", { class: "crown", "aria-label": "Winner", text: "♛" }) : null, b.name)
        : h(
            "button",
            { type: "button", class: "board__who", "aria-pressed": String(isUp), onclick: () => emit(this, "fk-frame", { bowler: bi, frame: nowFrame < 0 ? 9 : nowFrame }) },
            h("span", { class: "board__ball", "aria-hidden": "true" }),
            b.name,
          ),
    );
    const cells = views.map((v, fi) => {
      const editing = this.#edit?.bowler === bi && this.#edit.frame === fi;
      const now = isUp && fi === nowFrame && !this.#edit;
      const slots = fi === 9 ? 3 : 2;
      const marks = fi < 9 && v.marks[0] === "X" ? ["", "X"] : v.marks;
      const boxes = Array.from({ length: slots }, (_, k) =>
        h("span", { class: `mark${marks[k] === "X" ? " is-x" : marks[k] === "/" ? " is-spare" : ""}`, text: marks[k] ?? "" }),
      );
      const inner = [h("span", { class: "marks" }, boxes), h("span", { class: "running", text: v.running ?? "" })];
      const cls = ["frame", fi === 9 ? "is-tenth" : "", now ? "is-now" : "", editing ? "is-editing" : ""].join(" ").trim();
      if (this.#readonly) return h("td", { class: cls }, inner);
      const desc = `${b.name}, frame ${fi + 1}${v.balls.length ? `: ${v.marks.join(" ")}` : ""}${v.complete ? ", tap to correct" : ""}`;
      return h("td", { class: cls }, h("button", { type: "button", class: "frame__btn", "aria-label": desc, onclick: () => emit(this, "fk-frame", { bowler: bi, frame: fi }) }, inner));
    });
    const total = currentScore(b.frames);
    const max = maxPossible(b.frames);
    const totalCell = h(
      "td",
      { class: "board__total" },
      h("span", { class: "board__score", text: total }),
      !done && !this.#readonly ? h("span", { class: "board__max", title: "Best possible score", text: `max ${max}` }) : null,
    );
    return h("tr", { class: `${isUp ? "is-up" : ""}${b.won ? " is-winner" : ""}` }, nameCell, cells, totalCell);
  }
}

customElements.define("fk-scoreboard", FkScoreboard);
