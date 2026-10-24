// @ts-check
/**
 * <fk-setup> — new game form: lane/venue + bowler roster with quick-pick chips.
 * Properties: knownNames (from history), preset (names for a rematch).
 * Events: "fk-start" {venue, names}.
 */
import { h, emit } from "../dom.js";
import { MAX_BOWLERS, bowlerKey, cleanName } from "../stats.js";

export class FkSetup extends HTMLElement {
  /** @type {string[]} */
  #names = [];
  /** @type {string[]} */
  #known = [];
  /** @type {HTMLInputElement | null} */
  #input = null;
  /** @type {HTMLOListElement | null} */
  #list = null;
  /** @type {HTMLElement | null} */
  #chips = null;
  /** @type {HTMLButtonElement | null} */
  #startBtn = null;
  /** @type {HTMLElement | null} */
  #hint = null;

  /** @param {string[]} v */
  set knownNames(v) {
    this.#known = v;
    this.#sync();
  }
  /** @param {string[]} v */
  set preset(v) {
    this.#names = v.slice(0, MAX_BOWLERS);
    this.#sync();
  }

  connectedCallback() {
    if (this.#input) return;
    this.classList.add("setup");
    this.#input = h("input", { id: "fk-bowler-name", type: "text", autocomplete: "off", autocapitalize: "words", enterkeyhint: "done", maxlength: 20, placeholder: "Type a name" });
    this.#list = h("ol", { class: "roster", "aria-label": "Bowling order" });
    this.#chips = h("div", { class: "chips", role: "group", "aria-label": "Regulars" });
    this.#hint = h("p", { class: "setup__hint", id: "fk-setup-hint", "aria-live": "polite" });
    this.#startBtn = h("button", { type: "submit", class: "btn btn--big", text: "Roll it!" });
    const venue = h("input", { id: "fk-venue", type: "text", autocomplete: "off", maxlength: 40, placeholder: "Lucky Strike, lane 12" });

    const form = h(
      "form",
      { class: "setup__form", "aria-describedby": "fk-setup-hint", novalidate: true },
      h("h2", { class: "section-title", text: "Who's bowling?" }),
      h("div", { class: "field field--inline" },
        h("label", { for: "fk-bowler-name", class: "field__label", text: "Bowler" }),
        h("div", { class: "field__row" }, this.#input, h("button", { type: "button", class: "btn btn--ghost", text: "Add", onclick: () => this.#add() })),
      ),
      this.#chips,
      this.#list,
      h("div", { class: "field" },
        h("label", { for: "fk-venue", class: "field__label", text: "Alley & lane (optional)" }),
        venue,
      ),
      this.#hint,
      this.#startBtn,
    );
    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.#add();
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.#input?.value.trim()) this.#add();
      if (!this.#names.length) {
        this.#say("Add at least one bowler to start.");
        this.#input?.focus();
        return;
      }
      emit(this, "fk-start", { venue: venue.value, names: [...this.#names] });
      this.#names = [];
      venue.value = "";
      this.#sync();
    });
    this.append(form);
    this.#sync();
  }

  /** @param {string} [raw] */
  #add(raw) {
    const name = cleanName(raw ?? this.#input?.value ?? "");
    if (!name) return;
    if (this.#names.length >= MAX_BOWLERS) return this.#say(`Max ${MAX_BOWLERS} bowlers per game.`);
    if (this.#names.some((n) => bowlerKey(n) === bowlerKey(name))) return this.#say(`${name} is already in.`);
    this.#names.push(name);
    if (this.#input && raw === undefined) this.#input.value = "";
    this.#say("");
    this.#sync();
  }

  /** @param {string} msg */
  #say(msg) {
    if (this.#hint) this.#hint.textContent = msg;
  }

  #sync() {
    if (!this.#list || !this.#chips) return;
    this.#list.replaceChildren(
      ...this.#names.map((name, i) =>
        h("li", { class: "roster__item" },
          h("span", { class: "roster__num", "aria-hidden": "true", text: i + 1 }),
          h("span", { class: "roster__name", text: name }),
          h("button", { type: "button", class: "icon-btn", "aria-label": `Move ${name} up`, disabled: i === 0, text: "▲", onclick: () => this.#move(i, -1) }),
          h("button", { type: "button", class: "icon-btn", "aria-label": `Remove ${name}`, text: "✕", onclick: () => this.#remove(i) }),
        ),
      ),
    );
    const taken = new Set(this.#names.map(bowlerKey));
    const picks = this.#known.filter((n) => !taken.has(bowlerKey(n))).slice(0, 12);
    this.#chips.hidden = picks.length === 0;
    this.#chips.replaceChildren(...picks.map((n) => h("button", { type: "button", class: "chip", text: `+ ${n}`, onclick: () => this.#add(n) })));
    if (this.#startBtn) this.#startBtn.textContent = this.#names.length > 1 ? `Roll it! (${this.#names.length} bowlers)` : "Roll it!";
  }

  /** @param {number} i @param {number} dir */
  #move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= this.#names.length) return;
    [this.#names[i], this.#names[j]] = [this.#names[j], this.#names[i]];
    this.#sync();
  }

  /** @param {number} i */
  #remove(i) {
    this.#names.splice(i, 1);
    this.#sync();
  }
}

customElements.define("fk-setup", FkSetup);
