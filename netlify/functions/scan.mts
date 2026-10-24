import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Config } from "@netlify/functions";
import * as z from "zod/v4";
import { FRAME_COUNT, currentScore, isFrameComplete, isGameComplete, maxNextBall } from "../../src/scoring.js";
import { MAX_BOWLERS, cleanName } from "../../src/stats.js";

const MAX_IMAGE_BASE64 = 5_500_000; // ~4 MB image, under the 6 MB function payload limit
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

const ScanSchema = z.object({
  is_scoreboard: z.boolean(),
  notes: z.string(),
  bowlers: z.array(
    z.object({
      name: z.string(),
      frames: z.array(z.array(z.number().int())),
      printed_total: z.number().int().nullable(),
    }),
  ),
});

const PROMPT = `This photo should show a ten-pin bowling score display or score sheet, at any point in a game (frames not bowled yet are blank).
Read every bowler's game and convert the marks to pins knocked down per ball.

Notation: "X" = strike (10). "/" = spare: the pins left standing after the first ball. "-", "G", "F" or a blank ball = 0. A digit is that many pins; split markers (circles, "S", colored digits) still count as the digit.

Output, for each bowler top to bottom:
- name exactly as shown (often abbreviated).
- frames: one array per frame, pins per ball. Frames 1-9: a strike is [10], otherwise two balls, e.g. 7/ is [7,3], 9- is [9,0]. Frame 10 has three balls after a strike or spare ([10,10,10], [7,3,8], [10,4,6]) and two otherwise.
- printed_total: the latest total shown for that bowler (the running total mid-game), or null if none is visible.
Stop each bowler's frames where the blank, unbowled frames begin; include a frame in progress with just the balls bowled so far.

If you cannot read a ball with confidence, stop that bowler's frames at the last frame you are sure of and say which frame in notes. Never guess to make the totals add up.
Set is_scoreboard to false (with an empty bowlers list) if the photo isn't a bowling score display.`;

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Keep the longest prefix of frames that is legal ten-pin input. */
function legalPrefix(frames: number[][]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < Math.min(frames.length, FRAME_COUNT); i++) {
    const balls: number[] = [];
    for (const pins of frames[i].slice(0, 3)) {
      const max = maxNextBall(balls, i);
      if (max < 0 || pins < 0 || pins > max) break;
      balls.push(pins);
    }
    if (!isFrameComplete(balls, i)) {
      if (balls.length) out.push(balls);
      break;
    }
    out.push(balls);
  }
  return out;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "Not supported." }, 405);
  if (!Netlify.env.get("ANTHROPIC_API_KEY") && !Netlify.env.get("ANTHROPIC_BASE_URL")) {
    return json({ error: "Photo scoring isn't switched on for this site yet." }, 503);
  }

  let image = "";
  let mediaType: MediaType = "image/jpeg";
  try {
    const body = (await req.json()) as { image?: unknown; mediaType?: unknown };
    image = typeof body.image === "string" ? body.image : "";
    if (MEDIA_TYPES.includes(body.mediaType as MediaType)) mediaType = body.mediaType as MediaType;
  } catch {
    return json({ error: "Send the photo as JSON." }, 400);
  }
  if (!image || !/^[A-Za-z0-9+/=]+$/.test(image)) return json({ error: "No photo found in the upload." }, 400);
  if (image.length > MAX_IMAGE_BASE64) return json({ error: "That photo is too large. Try a smaller one." }, 413);

  // Credentials come from Netlify AI Gateway (or a site-level key) via the environment.
  const client = new Anthropic({ timeout: 55_000, maxRetries: 0 });
  try {
    const response = await client.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(ScanSchema) },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return json({ error: "Couldn't read that photo. Try another one." }, 422);
    const scan = response.parsed_output;
    if (!scan) return json({ error: "Couldn't read that photo. Try a sharper, straight-on shot." }, 422);
    if (!scan.is_scoreboard || scan.bowlers.length === 0) {
      return json({ error: "That doesn't look like a bowling scoreboard. Try a straight-on photo of the screen." }, 422);
    }

    const bowlers = scan.bowlers.slice(0, MAX_BOWLERS).map((b, i) => {
      const frames = legalPrefix(b.frames);
      const total = currentScore(frames);
      const complete = isGameComplete(frames);
      return {
        name: cleanName(b.name) || `Bowler ${i + 1}`,
        frames,
        total,
        complete,
        printedTotal: b.printed_total,
        // Mid-game, the display's running total should equal our last resolved total.
        matches: b.printed_total === null ? null : b.printed_total === total,
      };
    });
    return json({ bowlers, notes: scan.notes.slice(0, 400) });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Too many scans right now. Wait a minute and try again." }, 429);
    if (err instanceof Anthropic.APIConnectionTimeoutError) return json({ error: "Reading the photo took too long. Try again." }, 504);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      return json({ error: "Photo scoring isn't switched on for this site yet." }, 503);
    }
    if (err instanceof Anthropic.APIError) return json({ error: `The photo reader had a problem (${err.status ?? "network"}). Try again.` }, 502);
    throw err;
  }
};

export const config: Config = {
  path: "/api/scan",
  method: "POST",
  // Each scan is a paid model call: keep it to a handful per minute per phone.
  rateLimit: { windowLimit: 8, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
