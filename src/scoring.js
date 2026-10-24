// @ts-check
/**
 * Pure ten-pin scoring engine. No DOM, no storage.
 * A bowler's game is stored as frames: number[][] (pins per ball, grouped by frame),
 * so a single frame can be corrected without re-grouping everything after it.
 */

export const FRAME_COUNT = 10;
export const PINS = 10;

/** @typedef {number[][]} Frames */

/**
 * @typedef {Object} FrameView
 * @property {number[]} balls   Pins per ball in this frame.
 * @property {string[]} marks   Display marks: "X", "/", "-", or digits.
 * @property {number | null} running  Cumulative score once resolvable, else null.
 * @property {boolean} complete
 */

/**
 * @param {number} index
 * @returns {boolean}
 */
const isTenth = (index) => index === FRAME_COUNT - 1;

/**
 * Is this frame's ball entry finished?
 * @param {number[]} balls
 * @param {number} index
 * @returns {boolean}
 */
export function isFrameComplete(balls, index) {
  if (!isTenth(index)) return balls[0] === PINS || balls.length >= 2;
  if (balls.length < 2) return false;
  const bonus = balls[0] === PINS || balls[0] + balls[1] === PINS;
  return balls.length >= (bonus ? 3 : 2);
}

/**
 * Highest pin count allowed for the next ball of a frame, or -1 if the frame is complete.
 * @param {number[]} balls
 * @param {number} index
 * @returns {number}
 */
export function maxNextBall(balls, index) {
  if (isFrameComplete(balls, index)) return -1;
  if (balls.length === 0) return PINS;
  if (!isTenth(index)) return PINS - balls[0];
  const [b1, b2] = balls;
  if (balls.length === 1) return b1 === PINS ? PINS : PINS - b1;
  // Third ball in the tenth.
  if (b1 === PINS) return b2 === PINS ? PINS : PINS - b2;
  return PINS; // spare earned a fresh rack
}

/**
 * @param {number[]} balls
 * @param {number} index
 * @returns {string[]}
 */
export function frameMarks(balls, index) {
  /** @param {number} n */
  const digit = (n) => (n === 0 ? "-" : String(n));
  if (!isTenth(index)) {
    if (balls[0] === PINS) return ["X"];
    return balls.map((b, i) => (i === 1 && balls[0] + b === PINS ? "/" : digit(b)));
  }
  const [b1, b2, b3] = balls;
  /** @type {string[]} */
  const out = [];
  if (b1 !== undefined) out.push(b1 === PINS ? "X" : digit(b1));
  if (b2 !== undefined) {
    if (b1 === PINS) out.push(b2 === PINS ? "X" : digit(b2));
    else out.push(b1 + b2 === PINS ? "/" : digit(b2));
  }
  if (b3 !== undefined) {
    const freshRack = (b1 === PINS && b2 === PINS) || (b1 !== PINS && b1 + b2 === PINS);
    if (freshRack) out.push(b3 === PINS ? "X" : digit(b3));
    else out.push(b2 + b3 === PINS ? "/" : digit(b3));
  }
  return out;
}

/**
 * Score every frame. Strike = 10 + next two balls, spare = 10 + next ball.
 * @param {Frames} frames
 * @returns {FrameView[]}
 */
export function scoreFrames(frames) {
  const flat = frames.flat();
  /** @type {FrameView[]} */
  const views = [];
  let cursor = 0;
  let running = 0;
  let resolvable = true;
  for (let i = 0; i < FRAME_COUNT; i++) {
    const balls = frames[i] ?? [];
    const complete = isFrameComplete(balls, i);
    /** @type {number | null} */
    let frameScore = null;
    if (complete) {
      if (isTenth(i)) {
        frameScore = balls.reduce((a, b) => a + b, 0);
      } else {
        const strike = balls[0] === PINS;
        const spare = !strike && balls[0] + balls[1] === PINS;
        const need = strike ? 2 : spare ? 1 : 0;
        const bonus = flat.slice(cursor + balls.length, cursor + balls.length + need);
        if (bonus.length === need) {
          frameScore = (need ? PINS : balls[0] + balls[1]) + bonus.reduce((a, b) => a + b, 0);
        }
      }
    }
    if (frameScore === null) resolvable = false;
    if (resolvable && frameScore !== null) running += frameScore;
    views.push({
      balls,
      marks: frameMarks(balls, i),
      running: resolvable && frameScore !== null ? running : null,
      complete,
    });
    cursor += balls.length;
  }
  return views;
}

/**
 * @param {Frames} frames
 * @returns {number} Index of the first frame still taking balls, or 10 when the game is over.
 */
export function currentFrameIndex(frames) {
  for (let i = 0; i < FRAME_COUNT; i++) {
    if (!isFrameComplete(frames[i] ?? [], i)) return i;
  }
  return FRAME_COUNT;
}

/**
 * @param {Frames} frames
 * @returns {boolean}
 */
export const isGameComplete = (frames) => currentFrameIndex(frames) === FRAME_COUNT;

/**
 * Score counting only resolved frames (what a scoreboard shows mid-game).
 * @param {Frames} frames
 * @returns {number}
 */
export function currentScore(frames) {
  const views = scoreFrames(frames);
  let last = 0;
  for (const v of views) if (v.running !== null) last = v.running;
  return last;
}

/**
 * Best score still reachable if every remaining ball is a strike.
 * @param {Frames} frames
 * @returns {number}
 */
export function maxPossible(frames) {
  const sim = frames.map((f) => [...f]);
  for (let i = currentFrameIndex(sim); i < FRAME_COUNT; i = currentFrameIndex(sim)) {
    const balls = sim[i] ?? (sim[i] = []);
    balls.push(maxNextBall(balls, i));
  }
  return currentScore(sim);
}

/**
 * @param {Frames} frames
 * @returns {{ strikes: number, spares: number, gutters: number }}
 */
export function countMarks(frames) {
  let strikes = 0;
  let spares = 0;
  let gutters = 0;
  frames.forEach((balls, i) => {
    for (const m of frameMarks(balls, i)) {
      if (m === "X") strikes++;
      else if (m === "/") spares++;
      else if (m === "-") gutters++;
    }
  });
  return { strikes, spares, gutters };
}

/**
 * Validate a frames array from untrusted storage.
 * @param {unknown} value
 * @returns {value is Frames}
 */
export function isValidFrames(value) {
  if (!Array.isArray(value) || value.length > FRAME_COUNT) return false;
  return value.every((balls, i) => {
    if (!Array.isArray(balls) || balls.length > 3) return false;
    /** @type {number[]} */
    const seen = [];
    for (const b of balls) {
      if (!Number.isInteger(b)) return false;
      const max = maxNextBall(seen, i);
      if (max < 0 || b < 0 || b > max) return false;
      seen.push(b);
    }
    return true;
  });
}

/**
 * True when the next ball faces a full rack (first ball, or a tenth-frame reset).
 * Distinguishes a strike from a 10-count spare after a gutter.
 * @param {number[]} balls
 * @param {number} index
 * @returns {boolean}
 */
export function isFreshRack(balls, index) {
  if (balls.length === 0) return true;
  if (!isTenth(index)) return false;
  const [b1, b2] = balls;
  if (balls.length === 1) return b1 === PINS;
  return (b1 === PINS && b2 === PINS) || (b1 !== PINS && b1 + b2 === PINS);
}
