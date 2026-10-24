// @ts-check
/**
 * <fk-scan> — snap the alley's scoreboard and review what was read.
 * mode="new" (default): "Forgot to keep score?" loads the photo as a new game.
 * mode="update": mid-game, maps each row on the screen to a bowler and updates their frames.
 * Properties: knownNames (name suggestions), bowlers (game bowler names, update mode).
 * Events: "fk-scan-load" {bowlers: [{name, frames}]}, "fk-scan-update" {updates: [{bowler, frames}]}.
 */
import { h, emit } from "../dom.js";
import { downscale, toBase64 } from "../media.js";
import { frameMarks } from "../scoring.js";
import { cleanName, matchBowler } from "../stats.js";

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
  /** @type {string[]} */
  #bowlers = [];

  /** @param {string[]} v */
  set knownNames(v) {
    this.#known = v;
  }
  /** @param {string[]} v */
  set bowlers(v) {
    this.#bowlers = v;
  }

  get #update() {
    return this.getAttribute("mode") === "update";
  }

  /** Unique id prefix, so two scanners can share the page. */
  get #ids() {
    return this.id && this.id !== "scan" ? `fk-${this.id}` : "fk-scan";
  }

  connectedCallback() {
    if (this.#body) return;
    this.classList.add("scan");
    this.#file = h("input", { type: "file", accept: "image/*", capture: "environment", class: "sr-only", id: `${this.#ids}-file`, tabindex: -1, "aria-hidden": "true" });
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
        this.#update
          ? h("button", { type: "button", class: "btn btn--small btn--ghost", onclick: () => this.#pick() }, "Snap the screen")
          : h("button", { type: "button", class: "btn btn--ghost btn--wide scan__cta", onclick: () => this.#pick() }, "Forgot to keep score? Snap the scoreboard"),
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
    const ids = this.#ids;
    const listId = `${ids}-names`;
    /** @type {Set<number>} */
    const taken = new Set();
    const rows = s.bowlers.map((b, i) => {
      const marks = b.frames.map((f, fi) => frameMarks(f, fi).join("")).join(" ");
      const chip = b.matches === false
        ? h("span", { class: "chip-status is-warn", text: `Screen says ${b.printedTotal}. Tap frames to check.` })
        : !b.complete && !this.#update
          ? h("span", { class: "chip-status is-warn", text: `Read ${b.frames.length} of 10 frames. Finish on the pad.` })
          : b.matches
            ? h("span", { class: "chip-status is-ok", text: "Matches the screen" })
            : null;
      let who;
      if (this.#update) {
        // Map the row on the screen to a bowler in this game (best name match preselected).
        const match = matchBowler(b.name, this.#bowlers, taken);
        if (match >= 0) taken.add(match);
        who = [
          h("label", { class: "scan__label", for: `${ids}-map-${i}`, text: `On screen: ${b.name}` }),
          h("select", { id: `${ids}-map-${i}`, class: "scan__name" },
            this.#bowlers.map((n, bi) => h("option", { value: bi, selected: bi === match, text: n })),
            h("option", { value: -1, selected: match < 0, text: "Skip this row" }),
          ),
        ];
      } else {
        who = [
          h("label", { class: "sr-only", for: `${ids}-name-${i}`, text: `Bowler ${i + 1} name` }),
          h("input", { id: `${ids}-name-${i}`, class: "scan__name", type: "text", value: b.name, maxlength: 20, list: listId, autocomplete: "off" }),
        ];
      }
      return h("li", { class: `scan__row${this.#update ? " scan__row--map" : ""}` },
        ...who,
        h("span", { class: "scan__total", text: b.total }),
        h("span", { class: "scan__marks", text: marks || "No frames read" }),
        chip,
      );
    });
    const hint = this.#update
      ? "Check who's who, then update. Anyone the app has more balls for keeps the app's scores. Undo reverses it."
      : "Fix any names, then load the game. You can tap any frame to correct it.";
    body.replaceChildren(
      h("div", { class: "scan__review" },
        h("div", { class: "scan__head" }, thumb, h("div", {}, h("p", { class: "scan__title", text: "Here's what we read" }), h("p", { class: "scan__hint", text: hint }))),
        this.#update ? null : h("datalist", { id: listId }, this.#known.map((n) => h("option", { value: n }))),
        h("ol", { class: "scan__list" }, rows),
        s.notes ? h("p", { class: "scan__notes", text: s.notes }) : null,
        h("div", { class: "scan__actions" },
          h("button", { type: "button", class: "btn", text: this.#update ? "Update scores" : "Use these scores", onclick: () => this.#load(s.bowlers) }),
          h("button", { type: "button", class: "btn btn--small btn--ghost", text: "Retake", onclick: () => this.#pick() }),
          h("button", { type: "button", class: "btn btn--small btn--quiet", text: "Cancel", onclick: () => this.#set({ kind: "idle" }) }),
        ),
      ),
    );
  }

  /** @param {ScannedBowler[]} bowlers */
  #load(bowlers) {
    if (this.#update) {
      const updates = bowlers
        .map((b, i) => ({ bowler: Number(/** @type {HTMLSelectElement | null} */ (this.querySelector(`#${this.#ids}-map-${i}`))?.value ?? -1), frames: b.frames }))
        .filter((u, i, all) => u.bowler >= 0 && all.findIndex((x) => x.bowler === u.bowler) === i);
      emit(this, "fk-scan-update", { updates });
      this.#set({ kind: "idle" });
      return;
    }
    const named = bowlers.map((b, i) => {
      const input = /** @type {HTMLInputElement | null} */ (this.querySelector(`#${this.#ids}-name-${i}`));
      return { name: cleanName(input?.value ?? "") || b.name, frames: b.frames };
    });
    emit(this, "fk-scan-load", { bowlers: named });
    this.#set({ kind: "idle" });
  }
}

customElements.define("fk-scan", FkScan);
