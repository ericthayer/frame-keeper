// @ts-check
/**
 * <fk-celebrate> — marquee flash for strikes, spares, turkeys and wins.
 * Method: show(text, tone). Announces through a polite live region.
 */
import { h, art } from "../dom.js";

/** @typedef {"strike" | "spare" | "gutter" | "big"} Tone */

export class FkCelebrate extends HTMLElement {
  /** @type {HTMLElement | null} */
  #sign = null;
  /** @type {HTMLElement | null} */
  #text = null;
  /** @type {HTMLElement | null} */
  #live = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer;

  connectedCallback() {
    if (this.#sign) return;
    this.classList.add("celebrate");
    this.#text = h("span", { class: "celebrate__text" });
    this.#sign = h("div", { class: "celebrate__sign", "aria-hidden": "true" }, art("art-strike", "celebrate__art", "0 0 320 200"), this.#text);
    this.#live = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
    this.append(this.#sign, this.#live);
  }

  /**
   * @param {string} text
   * @param {Tone} tone
   * @returns {void}
   */
  show(text, tone) {
    if (!this.#sign || !this.#text || !this.#live) return;
    clearTimeout(this.#timer);
    this.#text.textContent = text;
    this.#live.textContent = text;
    this.dataset.tone = tone;
    this.classList.remove("is-on");
    void this.offsetWidth; // restart the animation
    this.classList.add("is-on");
    if (tone !== "gutter") {
      try {
        navigator.vibrate?.(tone === "big" ? [60, 40, 60, 40, 120] : 50);
      } catch {
        /* haptics are optional */
      }
    }
    this.#timer = setTimeout(() => this.classList.remove("is-on"), tone === "big" ? 2200 : 1300);
  }
}

customElements.define("fk-celebrate", FkCelebrate);
