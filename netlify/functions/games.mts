import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
// Same validation the client uses, so the server never stores an impossible game.
import { parseGame } from "../../src/stats.js";

const MAX_GAMES = 1000;
const MAX_BODY = 64 * 1024;

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export default async (req: Request, context: Context): Promise<Response> => {
  // Deploy previews get their own store so they never touch the league's real history.
  const scope = context.deploy?.context === "production" ? "games" : `games-${context.deploy?.context ?? "dev"}`;
  const store = getStore({ name: scope, consistency: "strong" });
  const id = context.params?.id;

  if (req.method === "GET") {
    const { blobs } = await store.list();
    const recent = blobs.map((b) => b.key).sort().reverse().slice(0, MAX_GAMES);
    const games = await Promise.all(recent.map((key) => store.get(key, { type: "json" })));
    return json({ games: games.filter(Boolean) });
  }

  if (req.method === "POST") {
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ error: "Game is too large." }, 413);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return json({ error: "Body must be JSON." }, 400);
    }
    const game = parseGame(raw);
    if (!game) return json({ error: "That doesn't look like a finished 10-frame game." }, 422);
    // Key leads with the timestamp so a reverse key sort is newest-first.
    await store.setJSON(`${game.playedAt}_${game.id}`, game);
    return json({ ok: true, id: game.id }, 201);
  }

  if (req.method === "DELETE" && id) {
    const { blobs } = await store.list();
    const match = blobs.find((b) => b.key.endsWith(`_${id}`));
    if (match) await store.delete(match.key);
    return json({ ok: true });
  }

  return json({ error: "Not supported." }, 405);
};

export const config: Config = {
  path: ["/api/games", "/api/games/:id"],
  method: ["GET", "POST", "DELETE"],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
