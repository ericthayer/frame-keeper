// @ts-check
/**
 * <fk-history> — saved games, newest first; expand for the full sheet.
 * Property: games (SavedGame[]), canDelete.
 * Events: "fk-share" {id}, "fk-delete" {id}, "fk-rematch" {names}.
 */
import { h, emit, formatDate } from "../dom.js";
import { gameResults } from "../stats.js";
import "./fk-scoreboard.js";

/** @typedef {import("../stats.js").SavedGame} SavedGame */

export class FkHistory extends HTMLElement {
  /** @type {SavedGame[]} */
  #games = [];
  /** @type {string | null} */
  #confirming = null;
  #limit = 20;

  /** @param {SavedGame[]} v */
  set games(v) {
    this.#games = v;
    if (this.isConnected) this.#render();
  }

  connectedCallback() {
    this.classList.add("history");
    this.#render();
  }

  #render() {
    if (!this.#games.length) {
      this.replaceChildren(
        h("div", { class: "empty" },
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
        h("time", { datetime: g.playedAt, text: formatDate(g.playedAt) }),
        g.venue ? h("span", { class: "card__venue", text: g.venue }) : null,
      ),
      h("ol", { class: "card__results" }, results.map((r) =>
        h("li", { class: r.won ? "is-winner" : "" },
          r.won ? h("span", { class: "crown", "aria-label": "Winner", text: "♛" }) : null,
          h("span", { class: "card__name", text: r.name }),
          h("span", { class: "card__score", text: r.total }),
        ),
      )),
    );
    const details = h("details", { class: "card", "data-id": g.id, open }, summary, board, actions);
    return h("li", {}, details);
  }
}

customElements.define("fk-history", FkHistory);
