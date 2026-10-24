import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { MAX_PHOTOS, PHOTO_ID } from "../../src/stats.js";

const MAX_BYTES = 3 * 1024 * 1024; // phones downscale before upload; this is a backstop
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const GAME_ID = /^[A-Za-z0-9_-]{1,64}$/;

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

type GameRecord = { id: string; photos?: string[] } & Record<string, unknown>;

export default async (req: Request, context: Context): Promise<Response> => {
  const gameId = context.params?.gameId ?? "";
  const photoId = context.params?.photoId;
  if (!GAME_ID.test(gameId) || (photoId !== undefined && !PHOTO_ID.test(photoId))) return json({ error: "Unknown photo." }, 404);

  const suffix = context.deploy?.context === "production" ? "" : `-${context.deploy?.context ?? "dev"}`;
  const photos = getStore({ name: `photos${suffix}`, consistency: "strong" });
  const games = getStore({ name: `games${suffix}`, consistency: "strong" });

  if (req.method === "GET" && photoId) {
    const found = await photos.getWithMetadata(`${gameId}/${photoId}`, { type: "arrayBuffer" });
    if (!found) return json({ error: "Photo not found." }, 404);
    const type = typeof found.metadata?.type === "string" ? found.metadata.type : "image/jpeg";
    return new Response(found.data, { headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" } });
  }

  // Writes go through the saved game, so photos only attach to real games.
  const { blobs } = await games.list();
  const key = blobs.find((b) => b.key.endsWith(`_${gameId}`))?.key;
  const game = key ? ((await games.get(key, { type: "json" })) as GameRecord | null) : null;
  if (!key || !game) return json({ error: "Save the game first, then add photos." }, 404);
  const list = Array.isArray(game.photos) ? game.photos : [];

  if (req.method === "POST" && !photoId) {
    const type = (req.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!TYPES.has(type)) return json({ error: "Photos must be JPEG, PNG or WebP." }, 415);
    if (list.length >= MAX_PHOTOS) return json({ error: `Up to ${MAX_PHOTOS} photos per game.` }, 409);
    const data = await req.arrayBuffer();
    if (data.byteLength === 0 || data.byteLength > MAX_BYTES) return json({ error: "That photo is too large." }, 413);
    const id = crypto.randomUUID();
    await photos.set(`${gameId}/${id}`, data, { metadata: { type } });
    const next = [...list, id];
    await games.setJSON(key, { ...game, photos: next });
    return json({ photos: next }, 201);
  }

  if (req.method === "DELETE" && photoId) {
    await photos.delete(`${gameId}/${photoId}`);
    const next = list.filter((p) => p !== photoId);
    await games.setJSON(key, { ...game, photos: next });
    return json({ photos: next });
  }

  return json({ error: "Not supported." }, 405);
};

export const config: Config = {
  path: ["/api/photos/:gameId", "/api/photos/:gameId/:photoId"],
  method: ["GET", "POST", "DELETE"],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
