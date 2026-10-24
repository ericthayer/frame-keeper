// @ts-check
/**
 * <fk-history> — saved games, newest first; expand for the full sheet.
 * Property: games (SavedGame[]), canDelete.
 * Events: "fk-share" {id}, "fk-delete" {id}, "fk-rematch" {names}.
 */
import { h, emit, formatDate, formatTime, art } from "../dom.js";
import { gameResults } from "../stats.js";
import { photoUrl } from "../media.js";
import "./fk-scoreboard.js";

/** @typedef {import("../stats.js").SavedGame} SavedGame */

/**
 * "Game N" for each game sharing a local calendar day with another, earliest first.
 * @param {SavedGame[]} games
 * @returns {Map<string, number>} Game id to its number that day; lone games are absent.
 */
function gameNumbers(games) {
  /** @type {Map<string, SavedGame[]>} */
  const days = new Map();
  for (const g of games) {
    const day = new Date(g.playedAt).toDateString();
    const same = days.get(day) ?? [];
    same.push(g);
    days.set(day, same);
  }
  /** @type {Map<string, number>} */
  const numbers = new Map();
  for (const same of days.values()) {
    if (same.length < 2) continue;
    same.sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt)).forEach((g, i) => numbers.set(g.id, i + 1));
  }
  return numbers;
}

export class FkHistory extends HTMLElement {
  /** @type {SavedGame[]} */
  #games = [];
  /** @type {Map<string, number>} */
  #numbers = new Map();
  /** @type {string | null} */
  #confirming = null;
  #limit = 20;
  /** @type {string | null} Game to open from a "#game-<id>" link once it loads. */
  #focus = null;

  /** Open and scroll to one game (from an emailed link). @param {string} id */
  focusGame(id) {
    this.#focus = id;
    this.#applyFocus();
  }

  #applyFocus() {
    if (!this.#focus) return;
    const idx = this.#games.findIndex((g) => g.id === this.#focus);
    if (idx < 0) return;
    if (idx >= this.#limit) {
      this.#limit = idx + 1;
      this.#render();
    }
    const card = /** @type {HTMLDetailsElement | null} */ (this.querySelector(`details[data-id="${CSS.escape(this.#focus)}"]`));
    if (!card) return;
    card.open = true;
    this.#focus = null;
    requestAnimationFrame(() => card.scrollIntoView({ block: "start" }));
  }

  /** @param {SavedGame[]} v */
  set games(v) {
    this.#games = v;
    this.#numbers = gameNumbers(v);
    if (this.isConnected) this.#render();
    this.#applyFocus();
  }

  connectedCallback() {
    this.classList.add("history");
    this.#render();
  }

  #render() {
    if (!this.#games.length) {
      this.replaceChildren(
        h("div", { class: "empty" },
          h("span", { class: "print-badge" }, art("art-sheet", "empty__art", "0 0 150 110")),
          h("p", { class: "empty__title", text: "No games in the books" }),
          h("p", { text: "Saved games show up here for everyone in the league, with the full score sheet." }),
        ),
      );
      return;
    }
    const open = new Set([...this.querySelectorAll("details[open]")].map((d) => d.getAttribute("data-id")));
    const shown = this.#games.slice(0, this.#limit);
    const items = shown.map((g) => this.#card(g, open.has(g.id)));
    const more = this.#games.length > this.#limit
      ? h("button", { type: "button", class: "btn btn--ghost btn--wide", text: `Show older games (${this.#games.length - this.#limit})`, onclick: () => { this.#limit += 20; this.#render(); } })
      : null;
    this.replaceChildren(h("ol", { class: "history__list", "aria-label": "Saved games" }, items), more ?? "");
  }

  /**
   * @param {SavedGame} g
   * @param {boolean} open
   * @returns {HTMLLIElement}
   */
  #card(g, open) {
    const results = gameResults(g);
    const winners = new Set(results.filter((r) => r.won).map((r) => r.key));
    const board = /** @type {import("./fk-scoreboard.js").FkScoreboard} */ (document.createElement("fk-scoreboard"));
    board.setAttribute("aria-label", `Score sheet, ${formatDate(g.playedAt)}`);
    board.readonly = true;
    board.active = -1;
    board.bowlers = g.bowlers.map((b) => ({ ...b, won: winners.has(results.find((r) => r.name === b.name)?.key ?? "") }));

    const confirming = this.#confirming === g.id;
    const actions = h("div", { class: "card__actions" },
      h("button", { type: "button", class: "btn btn--small", text: "Share", onclick: () => emit(this, "fk-share", { id: g.id }) }),
      h("button", { type: "button", class: "btn btn--small btn--ghost", text: "Rematch", onclick: () => emit(this, "fk-rematch", { names: g.bowlers.map((b) => b.name) }) }),
      confirming
        ? h("span", { class: "confirm", role: "group", "aria-label": "Confirm delete" },
            h("button", { type: "button", class: "btn btn--small btn--danger", text: "Delete for everyone", onclick: () => { this.#confirming = null; emit(this, "fk-delete", { id: g.id }); } }),
            h("button", { type: "button", class: "btn btn--small btn--ghost", text: "Keep", onclick: () => { this.#confirming = null; this.#render(); } }),
          )
        : h("button", { type: "button", class: "btn btn--small btn--quiet", text: "Delete", onclick: () => { this.#confirming = g.id; this.#render(); } }),
    );

    const summary = h("summary", { class: "card__summary" },
      h("span", { class: "card__meta" },
        h("time", { datetime: g.playedAt, text: `${formatDate(g.playedAt)} · ${formatTime(g.playedAt)}` }),
        this.#numbers.has(g.id) ? h("span", { class: "card__game", text: `Game ${this.#numbers.get(g.id)}` }) : null,
        g.venue ? h("span", { class: "card__venue", text: g.venue }) : null,
        g.photos?.length ? h("span", { class: "card__photos", text: `${g.photos.length} photo${g.photos.length === 1 ? "" : "s"}` }) : null,
      ),
      h("ol", { class: "card__results" }, results.map((r) =>
        h("li", { class: r.won ? "is-winner" : "" },
          r.won ? h("span", { class: "crown", "aria-label": "Winner", text: "♛" }) : null,
          h("span", { class: "card__name", text: r.name }),
          h("span", { class: "card__score", text: r.total }),
        ),
      )),
    );
    const photos = g.photos?.length
      ? h("ul", { class: "photo-grid photo-grid--card", "aria-label": "Game photos" },
          g.photos.map((p, i) => h("li", { class: "photo-grid__item" },
            h("a", { href: photoUrl(g.id, p), target: "_blank", rel: "noopener" }, h("img", { src: photoUrl(g.id, p), alt: `Photo ${i + 1} from this game`, loading: "lazy" })),
          )),
        )
      : null;
    const details = h("details", { class: "card", "data-id": g.id, open }, summary, board, photos, actions);
    return h("li", {}, details);
  }
}

customElements.define("fk-history", FkHistory);
