import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { isValidFrames } from "../../src/scoring.js";
import { MAX_BOWLERS, cleanName } from "../../src/stats.js";

const MAX_BODY = 32 * 1024;
const TTL_MS = 12 * 60 * 60 * 1000;
const CODE = /^[A-HJ-NP-Z]{4}$/;

type LiveRecord = { tokenHash: string; updatedAt: string; game: LiveGame };
type LiveGame = { id: string; venue: string; active: number; bowlers: Array<{ name: string; frames: number[][] }> };

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Accept only the fields watchers need, shaped like a real in-progress game. */
function parseLive(raw: unknown): LiveGame | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (typeof g.id !== "string" || !Array.isArray(g.bowlers)) return null;
  if (g.bowlers.length === 0 || g.bowlers.length > MAX_BOWLERS) return null;
  const bowlers: LiveGame["bowlers"] = [];
  for (const b of g.bowlers) {
    const { name, frames } = (b ?? {}) as Record<string, unknown>;
    if (typeof name !== "string" || !cleanName(name) || !isValidFrames(frames)) return null;
    bowlers.push({ name: cleanName(name), frames });
  }
  const active = Number.isInteger(g.active) ? Math.min(Math.max(g.active as number, 0), bowlers.length - 1) : 0;
  return { id: g.id.slice(0, 64), venue: typeof g.venue === "string" ? g.venue.slice(0, 40) : "", active, bowlers };
}

export default async (req: Request, context: Context): Promise<Response> => {
  const code = (context.params?.code ?? "").toUpperCase();
  if (!CODE.test(code)) return json({ error: "Lane codes are 4 letters." }, 400);
  const scope = context.deploy?.context === "production" ? "live" : `live-${context.deploy?.context ?? "dev"}`;
  const store = getStore({ name: scope, consistency: "strong" });
  const existing = (await store.get(code, { type: "json" })) as LiveRecord | null;
  const expired = existing && Date.now() - Date.parse(existing.updatedAt) > TTL_MS;
  if (expired) await store.delete(code);
  const current = expired ? null : existing;

  if (req.method === "GET") {
    if (!current) return json({ error: "No live game on that lane." }, 404);
    return json({ game: current.game, updatedAt: current.updatedAt });
  }

  const token = req.headers.get("x-live-token") ?? "";
  if (token.length < 16 || token.length > 128) return json({ error: "Missing scorekeeper token." }, 401);
  const tokenHash = await sha256(token);
  // Only the phone that opened the lane may update or close it.
  if (current && current.tokenHash !== tokenHash) return json({ error: "That lane code is taken." }, 409);

  if (req.method === "DELETE") {
    if (current) await store.delete(code);
    return json({ ok: true });
  }

  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: "Game is too large." }, 413);
    let game: LiveGame | null = null;
    try {
      game = parseLive(JSON.parse(text));
    } catch {
      game = null;
    }
    if (!game) return json({ error: "That doesn't look like a bowling game." }, 422);
    const record: LiveRecord = { tokenHash, updatedAt: new Date().toISOString(), game };
    if (!current) {
      // First write claims the code; a concurrent claim on the same code loses.
      const { modified } = await store.setJSON(code, record, { onlyIfNew: true });
      if (!modified) return json({ error: "That lane code is taken." }, 409);
    } else {
      await store.setJSON(code, record);
    }
    return json({ ok: true, updatedAt: record.updatedAt });
  }

  return json({ error: "Not supported." }, 405);
};

export const config: Config = {
  path: "/api/live/:code",
  method: ["GET", "PUT", "DELETE"],
  // Generous: several phones on one alley Wi-Fi share an IP and poll every 2s.
  rateLimit: { windowLimit: 400, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
