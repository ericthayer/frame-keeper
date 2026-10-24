// @ts-check
/** Saved-game model, normalization and leaderboard aggregation. Pure functions. */
import { currentScore, countMarks, isGameComplete, isValidFrames } from "./scoring.js";

/**
 * @typedef {Object} SavedBowler
 * @property {string} name
 * @property {number[][]} frames
 *
 * @typedef {Object} SavedGame
 * @property {string} id
 * @property {string} playedAt   ISO timestamp.
 * @property {string} venue
 * @property {SavedBowler[]} bowlers
 *
 * @typedef {Object} BowlerResult
 * @property {string} name
 * @property {string} key
 * @property {number} total
 * @property {number} strikes
 * @property {number} spares
 * @property {boolean} won
 *
 * @typedef {Object} BowlerStats
 * @property {string} key
 * @property {string} name
 * @property {number} games
 * @property {number} wins
 * @property {number} pins
 * @property {number} high
 * @property {number} average
 * @property {number} strikes
 *
 * @typedef {"pins" | "wins" | "games" | "high" | "average"} Category
 * @typedef {"all" | "30d" | "year"} Period
 */

export const MAX_BOWLERS = 8;
export const MAX_NAME = 20;

/**
 * Case/space-insensitive identity so "mike " and "Mike" share one record.
 * @param {string} name
 * @returns {string}
 */
export const bowlerKey = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * @param {string} name
 * @returns {string}
 */
export const cleanName = (name) => name.replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

/**
 * Coerce untrusted storage data into a SavedGame, or null if it is not one.
 * @param {unknown} raw
 * @returns {SavedGame | null}
 */
export function parseGame(raw) {
  if (!raw || typeof raw !== "object") return null;
  const g = /** @type {Record<string, unknown>} */ (raw);
  if (typeof g.id !== "string" || typeof g.playedAt !== "string") return null;
  if (Number.isNaN(Date.parse(g.playedAt))) return null;
  if (!Array.isArray(g.bowlers) || g.bowlers.length === 0 || g.bowlers.length > MAX_BOWLERS) return null;
  /** @type {SavedBowler[]} */
  const bowlers = [];
  for (const b of g.bowlers) {
    if (!b || typeof b !== "object") return null;
    const { name, frames } = /** @type {Record<string, unknown>} */ (b);
    if (typeof name !== "string" || !cleanName(name)) return null;
    if (!isValidFrames(frames) || !isGameComplete(frames)) return null;
    bowlers.push({ name: cleanName(name), frames });
  }
  return {
    id: g.id.slice(0, 64),
    playedAt: g.playedAt,
    venue: typeof g.venue === "string" ? g.venue.slice(0, 40) : "",
    bowlers,
  };
}

/**
 * Totals per bowler. Wins go to every top scorer in games with 2+ bowlers (ties share the win).
 * @param {SavedGame} game
 * @returns {BowlerResult[]} Sorted high to low.
 */
export function gameResults(game) {
  const rows = game.bowlers.map((b) => ({
    name: b.name,
    key: bowlerKey(b.name),
    total: currentScore(b.frames),
    ...countMarks(b.frames),
    won: false,
  }));
  const top = Math.max(...rows.map((r) => r.total));
  if (rows.length > 1) rows.forEach((r) => (r.won = r.total === top));
  return rows
    .map(({ name, key, total, strikes, spares, won }) => ({ name, key, total, strikes, spares, won }))
    .sort((a, b) => b.total - a.total);
}

/**
 * @param {SavedGame[]} games
 * @param {Period} period
 * @param {number} [now]
 * @returns {SavedGame[]}
 */
export function filterByPeriod(games, period, now = Date.now()) {
  if (period === "all") return games;
  const cutoff = period === "30d" ? now - 30 * 864e5 : new Date(new Date(now).getFullYear(), 0, 1).getTime();
  return games.filter((g) => Date.parse(g.playedAt) >= cutoff);
}

/**
 * @param {SavedGame[]} games
 * @returns {BowlerStats[]}
 */
export function aggregate(games) {
  /** @type {Map<string, BowlerStats & { lastSeen: number }>} */
  const map = new Map();
  for (const game of games) {
    const when = Date.parse(game.playedAt);
    for (const r of gameResults(game)) {
      const s = map.get(r.key) ?? { key: r.key, name: r.name, games: 0, wins: 0, pins: 0, high: 0, average: 0, strikes: 0, lastSeen: 0 };
      s.games++;
      s.pins += r.total;
      s.strikes += r.strikes;
      if (r.won) s.wins++;
      s.high = Math.max(s.high, r.total);
      // Display the most recently used spelling of the name.
      if (when >= s.lastSeen) {
        s.name = r.name;
        s.lastSeen = when;
      }
      map.set(r.key, s);
    }
  }
  return [...map.values()].map(({ lastSeen: _l, ...s }) => ({ ...s, average: Math.round(s.pins / s.games) }));
}

/**
 * Top N with shared ranks for ties ("1, 1, 3").
 * @param {BowlerStats[]} stats
 * @param {Category} category
 * @param {number} [n]
 * @returns {Array<BowlerStats & { rank: number, value: number }>}
 */
export function topBowlers(stats, category, n = 3) {
  const sorted = [...stats]
    .filter((s) => s[category] > 0)
    .sort((a, b) => b[category] - a[category] || b.games - a.games || a.name.localeCompare(b.name));
  /** @type {Array<BowlerStats & { rank: number, value: number }>} */
  const out = [];
  sorted.forEach((s, i) => {
    const rank = i > 0 && s[category] === sorted[i - 1][category] ? out[i - 1].rank : i + 1;
    if (rank <= n) out.push({ ...s, rank, value: s[category] });
  });
  return out.slice(0, n + 2); // allow a tie to spill past third place
}

/**
 * Plain-text result for sharing in a group chat.
 * @param {SavedGame} game
 * @returns {string}
 */
export function shareText(game) {
  const date = new Date(game.playedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const lines = gameResults(game).map((r, i) => `${r.won ? "👑" : `${i + 1}.`} ${r.name} — ${r.total}${r.strikes ? ` (${r.strikes}X)` : ""}`);
  return [`🎳 Frame Keeper · ${date}${game.venue ? ` · ${game.venue}` : ""}`, ...lines].join("\n");
}
