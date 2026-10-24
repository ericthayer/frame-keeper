// @ts-check
/**
 * Installs the offline shell (service worker) on hosts that opt in with
 * <meta name="fk:service-worker" content="/sw.js">. Only the Netlify build (dist/index.html)
 * carries that tag; the Claude artifact page never registers a worker.
 */
const script = document.querySelector('meta[name="fk:service-worker"]')?.getAttribute("content");
if (script && "serviceWorker" in navigator) {
  // Offline support is a bonus: the app works online without it, so a failed register is ignored.
  navigator.serviceWorker.register(script).catch(() => {});
}
