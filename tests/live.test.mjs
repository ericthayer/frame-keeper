import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { watchLane } from "../src/live.js";

const SNAP = { game: { id: "g", startedAt: "", venue: "", bowlers: [], active: 0 }, updatedAt: "t" };

/**
 * Watch a lane for `ms` of fake time while `status(n)` answers the nth GET.
 * @param {(n: number) => number} status
 * @param {number} ms
 * @returns {Promise<number[]>} Fake-clock time of each request.
 */
async function requestTimes(status, ms) {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  /** @type {number[]} */
  const times = [];
  globalThis.document = { visibilityState: "visible" };
  globalThis.fetch = async () => {
    times.push(Date.now());
    const code = status(times.length);
    return new Response(JSON.stringify(code === 200 ? SNAP : { error: "gone" }), { status: code });
  };
  const flush = () => new Promise((r) => setImmediate(r));
  const stop = watchLane("KQZP", { onUpdate() {}, onGone() {}, onError() {} });
  try {
    for (let t = 0; t < ms; t += 500) {
      await flush();
      mock.timers.tick(500);
    }
    await flush();
  } finally {
    stop();
    mock.timers.reset();
  }
  return times;
}

/** @param {number[]} times */
const gaps = (times) => times.slice(1).map((t, i) => t - times[i]);

test("after a 404 the watcher waits at least 10 seconds between requests", async () => {
  const times = await requestTimes(() => 404, 35_000);
  assert.ok(times.length >= 2, "keeps checking the lane");
  for (const gap of gaps(times)) assert.ok(gap >= 10_000, `polled again after ${gap}ms`);
});

test("once the lane answers 200 again, polling returns to every 2 seconds", async () => {
  const times = await requestTimes((n) => (n <= 2 ? 404 : 200), 30_000);
  assert.deepEqual(gaps(times).slice(0, 4), [10_000, 10_000, 2_000, 2_000]);
});
