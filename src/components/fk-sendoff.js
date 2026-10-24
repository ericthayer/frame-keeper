// @ts-check
/**
 * <fk-sendoff> — after a game is saved: add photos, then send results + photos to the bowlers.
 * Email goes through the phone's own mail app (no email service needed); addresses stay on this phone.
 * Property: game (SavedGame | null).
 * Events: "fk-photos-changed" {id, photos}.
 */
import { h, emit } from "../dom.js";
import { downscale, photoUrl } from "../media.js";
import { MAX_PHOTOS, bowlerKey, shareText } from "../stats.js";

/** @typedef {import("../stats.js").SavedGame} SavedGame */

const EMAILS_KEY = "frame-keeper:emails";
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** @returns {Record<string, string>} */
function loadEmails() {
  try {
    const v = JSON.parse(localStorage.getItem(EMAILS_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export class FkSendoff extends HTMLElement {
  /** @type {SavedGame | null} */
  #game = null;
  #busy = false;
  /** @type {HTMLInputElement | null} */
  #file = null;
  /** @type {HTMLElement | null} */
  #status = null;

  /** @param {SavedGame | null} v */
  set game(v) {
    const same = v?.id === this.#game?.id && (v?.photos ?? []).join() === (this.#game?.photos ?? []).join();
    this.#game = v;
    if (!same) this.#render();
  }

  connectedCallback() {
    this.classList.add("sendoff");
    this.#render();
  }

  #render() {
    const g = this.#game;
    this.hidden = !g;
    if (!g) return this.replaceChildren();
    const photos = g.photos ?? [];
    const emails = loadEmails();
    this.#file = h("input", { type: "file", accept: "image/*", multiple: true, class: "sr-only", tabindex: -1, "aria-hidden": "true" });
    this.#file.addEventListener("change", () => this.#upload([...(this.#file?.files ?? [])]));
    this.#status = h("p", { class: "sendoff__status", role: "status" });

    const grid = h("ul", { class: "photo-grid", "aria-label": "Game photos" },
      photos.map((p, i) =>
        h("li", { class: "photo-grid__item" },
          h("a", { href: photoUrl(g.id, p), target: "_blank", rel: "noopener" }, h("img", { src: photoUrl(g.id, p), alt: `Game photo ${i + 1}`, loading: "lazy" })),
          h("button", { type: "button", class: "photo-grid__remove", "aria-label": `Remove photo ${i + 1}`, text: "✕", onclick: () => this.#remove(p) }),
        ),
      ),
    );

    const fields = g.bowlers.map((b, i) =>
      h("div", { class: "field" },
        h("label", { class: "field__label", for: `fk-email-${i}`, text: `${b.name}'s email` }),
        h("input", { id: `fk-email-${i}`, type: "email", inputmode: "email", autocomplete: "email", value: emails[bowlerKey(b.name)] ?? "", placeholder: "name@example.com", "data-key": bowlerKey(b.name) }),
      ),
    );
    const canShareFiles = typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] });

    this.replaceChildren(
      h("section", { class: "sendoff__block", "aria-labelledby": "fk-photos-title" },
        h("h3", { class: "sendoff__title", id: "fk-photos-title", text: "Photos from the lanes" }),
        photos.length ? grid : h("p", { class: "sendoff__hint", text: "Add a few shots from tonight. They're saved with this game in History." }),
        photos.length < MAX_PHOTOS
          ? h("button", { type: "button", class: "btn btn--small btn--ghost", text: photos.length ? "Add more photos" : "Add photos", onclick: () => this.#file?.click(), disabled: this.#busy })
          : h("p", { class: "sendoff__hint", text: `That's the max of ${MAX_PHOTOS} photos.` }),
        this.#file,
      ),
      h("form", { class: "sendoff__block", "aria-labelledby": "fk-send-title", novalidate: true, onsubmit: (e) => this.#email(/** @type {SubmitEvent} */ (e)) },
        h("h3", { class: "sendoff__title", id: "fk-send-title", text: "Send to the crew" }),
        fields,
        h("div", { class: "field" },
          h("label", { class: "field__label", for: "fk-email-extra", text: "Anyone else (comma separated)" }),
          h("input", { id: "fk-email-extra", type: "text", inputmode: "email", autocomplete: "off", placeholder: "pat@example.com, sam@example.com" }),
        ),
        h("div", { class: "sendoff__actions" },
          h("button", { type: "submit", class: "btn btn--small", text: "Email the results" }),
          canShareFiles && photos.length ? h("button", { type: "button", class: "btn btn--small btn--ghost", text: "Share photos", onclick: () => this.#shareFiles() }) : null,
        ),
        h("p", { class: "sendoff__hint", text: "Opens your mail app with the scores and a link to the photos. Emails are remembered on this phone only." }),
      ),
      this.#status,
    );
  }

  /** @param {string} msg */
  #say(msg) {
    if (this.#status) this.#status.textContent = msg;
  }

  /** @param {File[]} files */
  async #upload(files) {
    const g = this.#game;
    if (!g || !files.length || this.#busy) return;
    this.#busy = true;
    const room = MAX_PHOTOS - (g.photos?.length ?? 0);
    const batch = files.slice(0, room);
    let photos = g.photos ?? [];
    try {
      for (const [i, file] of batch.entries()) {
        this.#say(`Uploading ${i + 1} of ${batch.length}…`);
        const blob = await downscale(file, 2000, 0.82);
        const res = await fetch(`/api/photos/${encodeURIComponent(g.id)}`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: blob });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `Upload failed (${res.status}).`);
        photos = body.photos;
      }
      this.#say(files.length > room ? `Added ${batch.length}. That's the max of ${MAX_PHOTOS}.` : `Added ${batch.length} photo${batch.length === 1 ? "" : "s"}.`);
    } catch (err) {
      this.#say(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      this.#busy = false;
      this.#game = { ...g, photos };
      const msg = this.#status?.textContent ?? "";
      this.#render();
      this.#say(msg);
      emit(this, "fk-photos-changed", { id: g.id, photos });
    }
  }

  /** @param {string} photoId */
  async #remove(photoId) {
    const g = this.#game;
    if (!g) return;
    const res = await fetch(`/api/photos/${encodeURIComponent(g.id)}/${photoId}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return this.#say(body.error ?? "Couldn't remove that photo.");
    this.#game = { ...g, photos: body.photos };
    this.#render();
    emit(this, "fk-photos-changed", { id: g.id, photos: body.photos });
  }

  /** @param {SubmitEvent} e */
  #email(e) {
    e.preventDefault();
    const g = this.#game;
    if (!g) return;
    const emails = loadEmails();
    /** @type {string[]} */
    const to = [];
    /** @type {string[]} */
    const bad = [];
    this.querySelectorAll("input[data-key]").forEach((el) => {
      const input = /** @type {HTMLInputElement} */ (el);
      const v = input.value.trim();
      emails[input.dataset.key ?? ""] = v;
      if (v) (EMAIL.test(v) ? to : bad).push(v);
    });
    const extra = /** @type {HTMLInputElement | null} */ (this.querySelector("#fk-email-extra"))?.value ?? "";
    for (const v of extra.split(/[,;\s]+/).filter(Boolean)) (EMAIL.test(v) ? to : bad).push(v);
    try {
      localStorage.setItem(EMAILS_KEY, JSON.stringify(emails));
    } catch {
      /* remembering is a convenience */
    }
    if (bad.length) return this.#say(`Check ${bad.join(", ")}: that doesn't look like an email address.`);
    if (!to.length) return this.#say("Add at least one email address.");
    const link = `${location.origin}${location.pathname}#game-${g.id}`;
    const lines = [shareText(g), "", `Score sheet${g.photos?.length ? " and photos" : ""}: ${link}`];
    const winner = shareText(g).split("\n")[1]?.replace(/^\S+\s/, "") ?? "";
    const subject = `Bowling night results${winner ? `: ${winner}` : ""}`;
    const href = `mailto:${to.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\r\n"))}`;
    window.location.href = href;
    this.#say(`Opening your mail app for ${to.length} ${to.length === 1 ? "person" : "people"}.`);
  }

  async #shareFiles() {
    const g = this.#game;
    if (!g?.photos?.length) return;
    try {
      this.#say("Getting photos ready…");
      const files = await Promise.all(
        g.photos.map(async (p, i) => new File([await (await fetch(photoUrl(g.id, p))).blob()], `bowling-${i + 1}.jpg`, { type: "image/jpeg" })),
      );
      await navigator.share({ files, title: "Bowling night", text: shareText(g) });
      this.#say("");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return this.#say("");
      this.#say("Sharing photos isn't available here. Use Email the results instead.");
    }
  }
}

customElements.define("fk-sendoff", FkSendoff);
