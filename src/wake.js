// @ts-check
/** Keep the phone screen on while a game is being scored. */

/** @type {{ release(): Promise<void> } | null} */
let lock = null;

/**
 * Request a screen wake lock when `wanted()` is true; tolerate refusal.
 * @param {() => boolean} wanted
 * @returns {Promise<void>}
 */
export async function keepAwake(wanted) {
  const nav = /** @type {Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }} */ (navigator);
  if (!nav.wakeLock || !wanted() || lock) return;
  try {
    lock = await nav.wakeLock.request("screen");
    /** @type {EventTarget} */ (/** @type {unknown} */ (lock)).addEventListener?.("release", () => (lock = null));
  } catch {
    lock = null;
  }
}
