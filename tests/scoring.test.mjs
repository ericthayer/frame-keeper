import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreFrames, currentScore, maxPossible, maxNextBall, isGameComplete,
  frameMarks, isValidFrames, countMarks,
} from "../src/scoring.js";

/** Group a flat roll list into frames (test helper). */
function toFrames(rolls) {
  const frames = [];
  let i = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    if (f < 9) {
      if (rolls[i] === 10) { frames.push([10]); i += 1; }
      else { frames.push(rolls.slice(i, i + 2)); i += 2; }
    } else frames.push(rolls.slice(i));
  }
  return frames;
}

test("perfect game is 300", () => {
  const f = toFrames(Array(12).fill(10));
  assert.equal(currentScore(f), 300);
  assert.ok(isGameComplete(f));
  assert.deepEqual(frameMarks(f[9], 9), ["X", "X", "X"]);
});

test("all spares 5/5 + 5 is 150", () => {
  assert.equal(currentScore(toFrames(Array(21).fill(5))), 150);
});

test("all gutters is 0", () => {
  const f = toFrames(Array(20).fill(0));
  assert.equal(currentScore(f), 0);
  assert.ok(isGameComplete(f));
  assert.equal(countMarks(f).gutters, 20);
});

test("classic sample game scores 133", () => {
  const rolls = [1,4, 4,5, 6,4, 5,5, 10, 0,1, 7,3, 6,4, 10, 2,8,6];
  const views = scoreFrames(toFrames(rolls));
  assert.deepEqual(views.map(v => v.running), [5,14,29,49,60,61,77,97,117,133]);
});

test("strike waits for two bonus balls", () => {
  const views = scoreFrames([[10], [3]]);
  assert.equal(views[0].running, null);
  assert.equal(currentScore([[10], [3, 4]]), 24);
});

test("tenth frame ball limits", () => {
  assert.equal(maxNextBall([], 9), 10);
  assert.equal(maxNextBall([10], 9), 10);
  assert.equal(maxNextBall([10, 4], 9), 6);
  assert.equal(maxNextBall([3, 7], 9), 10);
  assert.equal(maxNextBall([3, 4], 9), -1);
  assert.equal(maxNextBall([3], 0), 7);
  assert.deepEqual(frameMarks([10, 4, 6], 9), ["X", "4", "/"]);
  assert.deepEqual(frameMarks([3, 7, 0], 9), ["3", "/", "-"]);
});

test("max possible from fresh game is 300", () => {
  assert.equal(maxPossible([]), 300);
  assert.equal(maxPossible(toFrames([0,0])), 270);
});

test("frame validation rejects impossible input", () => {
  assert.ok(isValidFrames([[10], [3, 7], [10, 10, 10]]) === false); // 3 balls outside tenth
  assert.ok(isValidFrames([[6, 5]]) === false);
  assert.ok(isValidFrames([[10], [3, 7]]));
  assert.ok(isValidFrames("nope") === false);
});

test("lastBallMoment names the ball worth celebrating", async () => {
  // game.js touches localStorage only inside GameSession, so importing it in Node is safe.
  const { lastBallMoment } = await import("../src/game.js");
  assert.equal(lastBallMoment([]), null);
  assert.equal(lastBallMoment([[10]]), "strike");
  assert.equal(lastBallMoment([[10], [10], [10]]), "turkey");
  assert.equal(lastBallMoment([[3, 7]]), "spare");
  assert.equal(lastBallMoment([[0]]), "gutter");
  assert.equal(lastBallMoment([[4, 0]]), null);
  assert.equal(lastBallMoment([[0, 10]]), "spare");
  assert.equal(lastBallMoment(toFrames(Array(12).fill(10))), "perfect");
});
