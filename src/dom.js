// @ts-check
/** Tiny DOM builder: no innerHTML, text always goes through textContent. */

/**
 * @typedef {Record<string, string | number | boolean | null | undefined | EventListener>} Props
 * @typedef {Node | string | number | null | undefined | false} Child
 */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Props} [props]
 * @param {...(Child | Child[])} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key === "class") el.className = String(value);
    else if (key === "text") el.textContent = String(value);
    else if (value === true) el.setAttribute(key, "");
    else el.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/**
 * Decorative illustration from the page's SVG sprite (#art-*).
 * @param {string} id
 * @param {string} className
 * @param {string} viewBox
 * @returns {SVGSVGElement}
 */
export function art(id, className, viewBox) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = /** @type {SVGSVGElement} */ (document.createElementNS(ns, "svg"));
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", `#${id}`);
  svg.append(use);
  return svg;
}

/**
 * Fire a typed, bubbling custom event from a component.
 * @template T
 * @param {HTMLElement} el
 * @param {string} type
 * @param {T} detail
 * @returns {void}
 */
export function emit(el, type, detail) {
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/**
 * @param {string} iso
 * @returns {string}
 */
export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/**
 * @param {string} iso
 * @returns {string} Local clock time, e.g. "8:19 PM".
 */
export const formatTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
