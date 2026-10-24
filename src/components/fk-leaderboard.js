// @ts-check
/**
 * <fk-leaderboard> — podiums for pins, wins, games, plus a full stat sheet.
 * Property: games (SavedGame[]).
 */
import { h, art } from "../dom.js";
import { aggregate, filterByPeriod, topBowlers } from "../stats.js";

/** @typedef {import("../stats.js").SavedGame} SavedGame */
/** @typedef {import("../stats.js").Category} Category */
/** @typedef {import("../stats.js").Period} Period */

/** @type {Array<{ key: Category, title: string, unit: string }>} */
const BOARDS = [
  { key: "pins", title: "Pin Count", unit: "pins" },
  { key: "wins", title: "Games Won", unit: "wins" },
  { key: "games", title: "Games Bowled", unit: "games" },
];
/** @type {Array<{ key: Category, title: string, unit: string }>} */
const BONUS = [
  { key: "high", title: "High Game", unit: "" },
  { key: "average", title: "Best Average", unit: "avg" },
];
/** @type {Array<[Period, string]>} */
const PERIODS = [["all", "All time"], ["year", "This year"], ["30d", "Last 30 days"]];
const PERIOD_KEY = "frame-keeper:period";

export class FkLeaderboard extends HTMLElement {
  /** @type {SavedGame[]} */
  #games = [];
  /** @type {Period} */
  #period = "all";

  constructor() {
    super();
    try {
      const p = localStorage.getItem(PERIOD_KEY);
      if (p === "all" || p === "year" || p === "30d") this.#period = p;
    } catch {
      /* default period */
    }
  }

  /** @param {SavedGame[]} v */
  set games(v) {
    this.#games = v;
    if (this.isConnected) this.#render();
  }

  connectedCallback() {
    this.classList.add("leaders");
    this.#render();
  }

  #render() {
    const games = filterByPeriod(this.#games, this.#period);
    const stats = aggregate(games);
    const tabs = h(
      "div",
      { class: "seg", role: "radiogroup", "aria-label": "Time period" },
      PERIODS.map(([key, label]) =>
        h("button", {
          type: "button",
          role: "radio",
          class: "seg__btn",
          "aria-checked": String(key === this.#period),
          text: label,
          onclick: () => {
            this.#period = key;
            try {
              localStorage.setItem(PERIOD_KEY, key);
            } catch {
              /* not remembered */
            }
            this.#render();
          },
        }),
      ),
    );

    if (!stats.length) {
      this.replaceChildren(
        tabs,
        h("div", { class: "empty" },
          h("span", { class: "print-badge" }, art("art-trophy", "empty__art", "0 0 100 120")),
          h("p", { class: "empty__title", text: "No scores on the board yet" }),
          h("p", { text: "Finish a game and tap Save to history. The top three in each category land here." }),
        ),
      );
      return;
    }

    const podiums = h("div", { class: "podiums" }, BOARDS.map((b) => this.#podium(b, stats, true)));
    const bonus = h("div", { class: "podiums podiums--bonus" }, BONUS.map((b) => this.#podium(b, stats, false)));
    const sorted = [...stats].sort((a, b) => b.average - a.average);
    const sheet = h(
      "div",
      { class: "sheet", role: "region", "aria-label": "All bowlers", tabindex: 0 },
      h("table", { class: "sheet__table" },
        h("caption", { class: "sheet__cap", text: `Every bowler · ${games.length} game${games.length === 1 ? "" : "s"}` }),
        h("thead", {}, h("tr", {}, ["Bowler", "Games", "Wins", "Avg", "High", "Strikes", "Pins"].map((t, i) => h("th", { scope: "col", class: i ? "num" : "", text: t })))),
        h("tbody", {}, sorted.map((s) =>
          h("tr", {},
            h("th", { scope: "row", text: s.name }),
            [s.games, s.wins, s.average, s.high, s.strikes, s.pins.toLocaleString()].map((v) => h("td", { class: "num", text: v })),
          ),
        )),
      ),
    );
    this.replaceChildren(tabs, podiums, bonus, sheet);
  }

  /**
   * @param {{ key: Category, title: string, unit: string }} board
   * @param {import("../stats.js").BowlerStats[]} stats
   * @param {boolean} big
   * @returns {HTMLElement}
   */
  #podium(board, stats, big) {
    const top = topBowlers(stats, board.key, big ? 3 : 1);
    const id = `fk-podium-${board.key}`;
    return h(
      "section",
      { class: `podium${big ? "" : " podium--mini"}`, "aria-labelledby": id },
      h("h3", { class: "podium__title", id, text: board.title }),
      top.length
        ? h("ol", { class: "podium__list" }, top.map((t) =>
            h("li", { class: `podium__row rank-${Math.min(t.rank, 4)}` },
              h("span", { class: "podium__rank", "aria-label": `Rank ${t.rank}`, text: t.rank }),
              h("span", { class: "podium__name", text: t.name }),
              h("span", { class: "podium__value" }, String(t.value.toLocaleString()), board.unit ? h("small", { text: ` ${t.value === 1 ? board.unit.replace(/s$/, "") : board.unit}` }) : null),
            ),
          ))
        : h("p", { class: "podium__none", text: board.key === "wins" ? "Wins need 2+ bowlers in a game." : "Nothing yet." }),
    );
  }
}

customElements.define("fk-leaderboard", FkLeaderboard);
