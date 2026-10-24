// @ts-check
/**
 * <fk-pinpad> — thumb-sized pin entry. Only legal counts are enabled.
 * Properties: max (pins standing, -1 = locked), fresh (full rack: strike vs spare), canUndo.
 * Events: "fk-roll" {pins}, "fk-undo".
 */
import { h, emit } from "../dom.js";

/** Pin positions on a rack, back row first (7-8-9-10 … 1). */
const RACK = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

export class FkPinpad extends HTMLElement {
  #max = -1;
  #canUndo = false;
  #fresh = true;
  /** @type {Map<string, HTMLButtonElement>} */
  #keys = new Map();
  /** @type {HTMLButtonElement | null} */
  #undoBtn = null;
  /** @type {HTMLElement | null} */
  #rack = null;

  /** @param {number} v */
  set max(v) {
    this.#max = v;
    this.#sync();
  }
  /** @param {boolean} v */
  set fresh(v) {
    this.#fresh = v;
    this.#sync();
  }
  /** @param {boolean} v */
  set canUndo(v) {
    this.#canUndo = v;
    this.#sync();
  }

  connectedCallback() {
    if (this.#keys.size) return;
    this.classList.add("pad");
    this.#rack = h(
      "div",
      { class: "rack", "aria-hidden": "true" },
      RACK.map((row) => h("div", { class: "rack__row" }, row.map((n) => h("span", { class: "pin", "data-pin": n })))),
    );
    /** @type {Array<[string, string, string]>} key, label, accessible name */
    const layout = [
      ["1", "1", "1 pin"], ["2", "2", "2 pins"], ["3", "3", "3 pins"], ["4", "4", "4 pins"],
      ["5", "5", "5 pins"], ["6", "6", "6 pins"], ["7", "7", "7 pins"], ["8", "8", "8 pins"],
      ["9", "9", "9 pins"], ["0", "–", "Gutter, 0 pins"], ["/", "/", "Spare"], ["X", "X", "Strike"],
    ];
    const grid = h(
      "div",
      { class: "pad__grid", role: "group", "aria-label": "Pins knocked down" },
      layout.map(([key, label, name]) => {
        const btn = h("button", {
          type: "button",
          class: `key${key === "X" ? " key--strike" : key === "/" ? " key--spare" : key === "0" ? " key--gutter" : ""}`,
          "aria-label": name,
          "data-key": key,
          text: label,
          onclick: () => this.#press(key),
        });
        this.#keys.set(key, btn);
        return btn;
      }),
    );
    this.#undoBtn = h("button", { type: "button", class: "pad__undo", onclick: () => emit(this, "fk-undo", null) }, h("span", { "aria-hidden": "true", text: "↶ " }), "Undo");
    this.append(h("div", { class: "pad__top" }, this.#rack, this.#undoBtn), grid);
    this.addEventListener("keydown", (e) => this.#onKey(e));
    this.#sync();
  }

  /** @param {string} key */
  #press(key) {
    const pins = key === "X" || key === "/" ? this.#max : Number(key);
    if (this.#max < 0 || pins > this.#max) return;
    emit(this, "fk-roll", { pins });
  }

  /** Hardware keyboard: digits, x, /, backspace. @param {KeyboardEvent} e */
  #onKey(e) {
    const k = e.key.toUpperCase();
    if (k === "BACKSPACE") return emit(this, "fk-undo", null);
    if (k === "-") return this.#press("0");
    if (this.#keys.has(k) && !this.#keys.get(k)?.disabled) this.#press(k);
  }

  #sync() {
    if (!this.#keys.size) return;
    const max = this.#max;
    const fresh = this.#fresh;
    for (const [key, btn] of this.#keys) {
      let ok = false;
      if (key === "X") ok = fresh;
      else if (key === "/") ok = max > 0 && !fresh;
      else ok = max >= 0 && Number(key) <= max;
      // On a partial rack the remaining count is the spare key, not its digit.
      if (!fresh && max > 0 && Number(key) === max) ok = false;
      btn.disabled = !ok;
    }
    if (this.#undoBtn) this.#undoBtn.disabled = !this.#canUndo;
    // Show standing pins: knocked pins fall from the front of the rack.
    const down = max < 0 ? 10 : 10 - max;
    this.#rack?.querySelectorAll(".pin").forEach((pin) => {
      pin.classList.toggle("is-down", Number(/** @type {HTMLElement} */ (pin).dataset.pin) <= down);
    });
  }
}

customElements.define("fk-pinpad", FkPinpad);
