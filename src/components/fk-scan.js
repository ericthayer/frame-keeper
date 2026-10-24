// @ts-check
/**
 * <fk-scan> — "Forgot to keep score?" Snap the alley's scoreboard, review what was read, load it as a game.
 * Properties: knownNames (for name suggestions).
 * Events: "fk-scan-load" {bowlers: [{name, frames}]}.
 */
import { h, emit } from "../dom.js";
import { downscale, toBase64 } from "../media.js";
import { frameMarks } from "../scoring.js";
import { cleanName } from "../stats.js";

/**
 * @typedef {{ name: string, frames: number[][], total: number, complete: boolean, printedTotal: number | null, matches: boolean | null }} ScannedBowler
 * @typedef {{ kind: "idle" } | { kind: "reading", preview: string } | { kind: "review", preview: string, bowlers: ScannedBowler[], notes: string } | { kind: "error", message: string }} ScanState
 */

export class FkScan extends HTMLElement {
  /** @type {ScanState} */
  #state = { kind: "idle" };
  /** @type {string[]} */
  #known = [];
  /** @type {HTMLInputElement | null} */
  #file = null;
  /** @type {HTMLElement | null} */
  #body = null;

  /** @param {string[]} v */
  set knownNames(v) {
    this.#known = v;
  }

  connectedCallback() {
    if (this.#body) return;
    this.classList.add("scan");
    this.#file = h("input", { type: "file", accept: "image/*", capture: "environment", class: "sr-only", id: "fk-scan-file", tabindex: -1, "aria-hidden": "true" });
    this.#file.addEventListener("change", () => {
      const f = this.#file?.files?.[0];
      if (f) this.#read(f);
      if (this.#file) this.#file.value = "";
    });
    this.#body = h("div", { class: "scan__body", "aria-live": "polite" });
    this.append(this.#file, this.#body);
    this.#render();
  }

  /** @param {File} file */
  async #read(file) {
    const preview = URL.createObjectURL(file);
    this.#set({ kind: "reading", preview });
    try {
      const image = await toBase64(await downscale(file, 2000, 0.86));
      const res = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, mediaType: "image/jpeg" }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `The photo reader said ${res.status}.`);
      this.#set({ kind: "review", preview, bowlers: body.bowlers ?? [], notes: body.notes ?? "" });
    } catch (err) {
      URL.revokeObjectURL(preview);
      this.#set({ kind: "error", message: err instanceof Error ? err.message : "Couldn't read that photo." });
    }
  }

  /** @param {ScanState} s */
  #set(s) {
    if ("preview" in this.#state && (!("preview" in s) || s.preview !== this.#state.preview)) URL.revokeObjectURL(this.#state.preview);
    this.#state = s;
    this.#render();
    // The review sits below the splash art: bring it into view on a phone.
    if (s.kind !== "idle") requestAnimationFrame(() => this.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  #pick() {
    this.#file?.click();
  }

  #render() {
    const s = this.#state;
    const body = /** @type {HTMLElement} */ (this.#body);
    if (s.kind === "idle") {
      body.replaceChildren(
        h("button", { type: "button", class: "btn btn--ghost btn--wide scan__cta", onclick: () => this.#pick() }, "Forgot to keep score? Snap the scoreboard"),
      );
      return;
    }
    if (s.kind === "error") {
      body.replaceChildren(
        h("p", { class: "scan__error", role: "alert", text: s.message }),
        h("div", { class: "scan__actions" },
          h("button", { type: "button", class: "btn btn--small", text: "Try another photo", onclick: () => this.#pick() }),
          h("button", { type: "button", class: "btn btn--small btn--quiet", text: "Cancel", onclick: () => this.#set({ kind: "idle" }) }),
        ),
      );
      return;
    }
    const thumb = h("img", { class: "scan__thumb", src: s.preview, alt: "Your scoreboard photo" });
    if (s.kind === "reading") {
      body.replaceChildren(h("div", { class: "scan__reading" }, thumb, h("p", { class: "scan__status", text: "Reading the scoreboard… about 15 seconds." })));
      return;
    }
    const listId = "fk-scan-names";
    const rows = s.bowlers.map((b, i) => {
      const marks = b.frames.map((f, fi) => frameMarks(f, fi).join("")).join(" ");
      const chip = !b.complete
        ? h("span", { class: "chip-status is-warn", text: `Read ${b.frames.length} of 10 frames. Finish on the pad.` })
        : b.matches === false
          ? h("span", { class: "chip-status is-warn", text: `Screen says ${b.printedTotal}. Tap frames to check.` })
          : b.matches
            ? h("span", { class: "chip-status is-ok", text: "Matches the screen" })
            : null;
      return h("li", { class: "scan__row" },
        h("label", { class: "sr-only", for: `fk-scan-name-${i}`, text: `Bowler ${i + 1} name` }),
        h("input", { id: `fk-scan-name-${i}`, class: "scan__name", type: "text", value: b.name, maxlength: 20, list: listId, autocomplete: "off" }),
        h("span", { class: "scan__total", text: b.total }),
        h("span", { class: "scan__marks", text: marks || "No frames read" }),
        chip,
      );
    });
    body.replaceChildren(
      h("div", { class: "scan__review" },
        h("div", { class: "scan__head" }, thumb, h("div", {}, h("p", { class: "scan__title", text: "Here's what we read" }), h("p", { class: "scan__hint", text: "Fix any names, then load the game. You can tap any frame to correct it." }))),
        h("datalist", { id: listId }, this.#known.map((n) => h("option", { value: n }))),
        h("ol", { class: "scan__list" }, rows),
        s.notes ? h("p", { class: "scan__notes", text: s.notes }) : null,
        h("div", { class: "scan__actions" },
          h("button", { type: "button", class: "btn", text: "Use these scores", onclick: () => this.#load(s.bowlers) }),
          h("button", { type: "button", class: "btn btn--small btn--ghost", text: "Retake", onclick: () => this.#pick() }),
          h("button", { type: "button", class: "btn btn--small btn--quiet", text: "Cancel", onclick: () => this.#set({ kind: "idle" }) }),
        ),
      ),
    );
  }

  /** @param {ScannedBowler[]} bowlers */
  #load(bowlers) {
    const named = bowlers.map((b, i) => {
      const input = /** @type {HTMLInputElement | null} */ (this.querySelector(`#fk-scan-name-${i}`));
      return { name: cleanName(input?.value ?? "") || b.name, frames: b.frames };
    });
    emit(this, "fk-scan-load", { bowlers: named });
    this.#set({ kind: "idle" });
  }
}

customElements.define("fk-scan", FkScan);
