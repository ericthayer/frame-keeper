// @ts-check
/** Live game session: turn order, undo, frame edits, and on-device autosave. */
import { currentFrameIndex, isFrameComplete, isGameComplete, isFreshRack, maxNextBall, frameMarks, currentScore } from "./scoring.js";
import { cleanName } from "./stats.js";

/**
 * @typedef {{ name: string, frames: number[][] }} LiveBowler
 * @typedef {{ id: string, startedAt: string, venue: string, bowlers: LiveBowler[], active: number }} LiveGame
 * @typedef {{ bowler: number, frame: number, draft: number[] }} FrameEdit
 * @typedef {"strike" | "spare" | "gutter" | "turkey" | "perfect" | "final"} Moment
 */

const LIVE_KEY = "frame-keeper:live";
const MAX_UNDO = 120;

/** @returns {string} */
export const newId = () =>
  typeof crypto?.randomUUID === "function" ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);

/**
 * @param {unknown} v
 * @returns {v is LiveGame}
 */
function isLiveGame(v) {
  const g = /** @type {Partial<LiveGame> | null} */ (v);
  return !!g && typeof g.id === "string" && Array.isArray(g.bowlers) && g.bowlers.length > 0 && typeof g.active === "number";
}

/**
 * What the most recent ball in a bowler's game deserves: shared by the scorekeeper and live watchers.
 * @param {number[][]} frames
 * @returns {Moment | null}
 */
export function lastBallMoment(frames) {
  let f = frames.length - 1;
  while (f >= 0 && !(frames[f]?.length)) f--;
  if (f < 0) return null;
  const balls = frames[f];
  const marks = frames.flatMap((b, i) => frameMarks(b ?? [], i));
  const last = marks[marks.length - 1];
  if (last === "X") {
    if (isGameComplete(frames) && currentScore(frames) === 300) return "perfect";
    let run = 0;
    for (let i = marks.length - 1; i >= 0 && marks[i] === "X"; i--) run++;
    return run % 3 === 0 ? "turkey" : "strike";
  }
  if (last === "/") return "spare";
  if (balls[balls.length - 1] === 0 && isFreshRack(balls.slice(0, -1), f)) return "gutter";
  return null;
}

export class GameSession extends EventTarget {
  /** @type {LiveGame | null} */
  game = null;
  /** @type {FrameEdit | null} */
  edit = null;
  /** @type {string[]} */
  #undo = [];

  constructor() {
    super();
    try {
      const saved = JSON.parse(localStorage.getItem(LIVE_KEY) ?? "null");
      if (isLiveGame(saved)) this.game = saved;
    } catch {
      /* storage blocked: start fresh */
    }
  }

  /**
   * @param {string} venue
   * @param {string[]} names
   * @returns {void}
   */
  start(venue, names) {
    this.game = {
      id: newId(),
      startedAt: new Date().toISOString(),
      venue: venue.trim().slice(0, 40),
      bowlers: names.map((n) => ({ name: cleanName(n), frames: [] })),
      active: 0,
    };
    this.#undo = [];
    this.edit = null;
    this.#commit();
  }

  /** @returns {void} */
  clear() {
    this.game = null;
    this.edit = null;
    this.#undo = [];
    this.#commit();
  }

  get canUndo() {
    return this.#undo.length > 0;
  }

  get complete() {
    return !!this.game && this.game.bowlers.every((b) => isGameComplete(b.frames));
  }

  /** Max pins for the next ball given the current target (live turn or frame edit). */
  get maxPins() {
    if (!this.game) return -1;
    if (this.edit) return maxNextBall(this.edit.draft, this.edit.frame);
    const b = this.game.bowlers[this.game.active];
    const f = currentFrameIndex(b.frames);
    return f >= 10 ? -1 : maxNextBall(b.frames[f] ?? [], f);
  }

  /** Where the next ball goes: bowler, frame, ball number (0-based). */
  get target() {
    if (!this.game) return null;
    if (this.edit) {
      const { bowler, frame, draft } = this.edit;
      return { bowler, frame, ball: draft.length, standing: this.maxPins, fresh: isFreshRack(draft, frame) };
    }
    const b = this.game.bowlers[this.game.active];
    const frame = currentFrameIndex(b.frames);
    const balls = b.frames[frame] ?? [];
    return { bowler: this.game.active, frame, ball: balls.length, standing: this.maxPins, fresh: isFreshRack(balls, frame) };
  }

  /**
   * Record a ball. Returns the moment worth celebrating, if any.
   * @param {number} pins
   * @returns {Moment | null}
   */
  roll(pins) {
    const g = this.game;
    const max = this.maxPins;
    if (!g || max < 0 || pins < 0 || pins > max) return null;
    if (this.edit) return this.#rollEdit(pins);

    this.#snapshot();
    const bowler = g.bowlers[g.active];
    const f = currentFrameIndex(bowler.frames);
    const balls = (bowler.frames[f] ??= []);
    balls.push(pins);
    const moment = lastBallMoment(bowler.frames);
    if (isFrameComplete(balls, f)) this.#advance();
    this.#commit();
    return this.complete ? "final" : moment;
  }

  /** @returns {void} */
  undo() {
    if (this.edit) {
      if (this.edit.draft.length) this.edit.draft.pop();
      else this.edit = null;
      this.#emit();
      return;
    }
    const prev = this.#undo.pop();
    if (!prev || !this.game) return;
    const { bowlers, active } = JSON.parse(prev);
    this.game.bowlers = bowlers;
    this.game.active = active;
    this.#commit();
  }

  /**
   * Tap a bowler's frame: completed frames open for correction; otherwise make them "up".
   * @param {number} bowler
   * @param {number} frame
   * @returns {void}
   */
  select(bowler, frame) {
    const g = this.game;
    if (!g?.bowlers[bowler]) return;
    const balls = g.bowlers[bowler].frames[frame] ?? [];
    if (isFrameComplete(balls, frame)) {
      this.edit = { bowler, frame, draft: [] };
    } else {
      this.edit = null;
      if (!isGameComplete(g.bowlers[bowler].frames)) g.active = bowler;
    }
    this.#commit();
  }

  /** @returns {void} */
  cancelEdit() {
    this.edit = null;
    this.#emit();
  }

  /**
   * @param {number} pins
   * @returns {Moment | null}
   */
  #rollEdit(pins) {
    const g = /** @type {LiveGame} */ (this.game);
    const edit = /** @type {FrameEdit} */ (this.edit);
    edit.draft.push(pins);
    if (isFrameComplete(edit.draft, edit.frame)) {
      this.#snapshot();
      g.bowlers[edit.bowler].frames[edit.frame] = [...edit.draft];
      this.edit = null;
      this.#commit();
    } else this.#emit();
    return null;
  }

  /** Next bowler (cyclic) who still has frames left. */
  #advance() {
    const g = /** @type {LiveGame} */ (this.game);
    const n = g.bowlers.length;
    for (let step = 1; step <= n; step++) {
      const i = (g.active + step) % n;
      if (!isGameComplete(g.bowlers[i].frames)) {
        g.active = i;
        return;
      }
    }
  }

  #snapshot() {
    const g = /** @type {LiveGame} */ (this.game);
    this.#undo.push(JSON.stringify({ bowlers: g.bowlers, active: g.active }));
    if (this.#undo.length > MAX_UNDO) this.#undo.shift();
  }

  #commit() {
    try {
      if (this.game) localStorage.setItem(LIVE_KEY, JSON.stringify(this.game));
      else localStorage.removeItem(LIVE_KEY);
    } catch {
      /* autosave is a convenience */
    }
    this.#emit();
  }

  #emit() {
    this.dispatchEvent(new Event("change"));
  }
}
