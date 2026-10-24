// @ts-check
/** Share a saved game's result: system share sheet first, clipboard second. */
import { gameResults, shareText } from "./stats.js";

/**
 * @param {import("./stats.js").SavedGame} game
 * @param {boolean} linkable  True when the page has a public URL worth sharing.
 * @param {(msg: string) => void} toast
 * @returns {Promise<void>}
 */
export async function shareResult(game, linkable, toast) {
  const text = shareText(game);
  try {
    if (navigator.share) {
      await navigator.share({ text, ...(linkable ? { url: `${location.origin}${location.pathname}#game-${game.id}` } : {}) });
      return;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Result copied. Paste it in the group chat.");
  } catch {
    const [top] = gameResults(game);
    toast(`${top.name} won with ${top.total}. Copy blocked here.`);
  }
}
