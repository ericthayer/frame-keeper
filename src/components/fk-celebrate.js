// @ts-check
/**
 * <fk-celebrate> — strikes, spares, turkeys and wins slap on screen as a vintage matchbook cover;
 * a gutter ball gets the plain sign. Method: show(text, tone). Announces through a polite live region.
 */
import { h, art } from "../dom.js";

/** @typedef {"strike" | "spare" | "gutter" | "big"} Tone */

/** Script line printed under the call, like the slogan on a matchbook cover. @param {string} text @param {Tone} tone */
function tagline(text, tone) {
  if (tone === "strike") return "right in the pocket!";
  if (tone === "spare") return "picked it up!";
  if (/^TURKEY/.test(text)) return "three in a row!";
  if (/^PERFECT/.test(text)) return "a perfect game!";
  return "good game, gang!";
}

export class FkCelebrate extends HTMLElement {
  /** @type {HTMLElement | null} */
  #sign = null;
  /** @type {HTMLElement | null} */
  #word = null;
  /** @type {HTMLElement | null} */
  #tagline = null;
  /** @type {HTMLElement | null} */
  #live = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #timer;

  connectedCallback() {
    if (this.#sign) return;
    this.classList.add("celebrate");
    this.#sign = h("div", { class: "celebrate__sign", "aria-hidden": "true" });
    this.#word = h("span", { class: "celebrate__word" });
    this.#tagline = h("span", { class: "celebrate__tagline" });
    const book = h(
      "div",
      { class: "celebrate__book", "aria-hidden": "true" },
      h("div", { class: "celebrate__cover" },
        h("span", { class: "celebrate__banner" }, art("art-brush", "celebrate__brush", "0 0 300 80"), this.#word),
        this.#tagline,
        art("art-scene-strike", "celebrate__scene celebrate__scene--strike", "0 0 240 150"),
        art("art-scene-spare", "celebrate__scene celebrate__scene--spare", "0 0 240 150"),
      ),
      h("span", { class: "celebrate__striker" }, h("span", { class: "celebrate__staple" })),
    );
    this.#live = h("p", { class: "sr-only", role: "status", "aria-live": "polite" });
    this.append(this.#sign, book, this.#live);
  }

  /**
   * @param {string} text
   * @param {Tone} tone
   * @returns {void}
   */
  show(text, tone) {
    if (!this.#sign || !this.#word || !this.#tagline || !this.#live) return;
    clearTimeout(this.#timer);
    this.#sign.textContent = text;
    this.#word.textContent = text;
    this.#tagline.textContent = tagline(text, tone);
    this.#live.textContent = text;
    this.dataset.tone = tone;
    this.toggleAttribute("data-long", text.length > 9);
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
