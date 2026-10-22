import { allow, clientId } from "@/lib/ratelimit";
import { speak, voiceError } from "@/lib/tts";
import { GTTS_MAX_CHARS, type VoiceErrorCode } from "@/lib/voice";

export const runtime = "nodejs";
export const maxDuration = 30;

/** How many sentences one reader may ask for in a minute. */
const PER_MINUTE = 40;

/**
 * A refusal, in words the reader can be shown.
 *
 * The code says which refusal it is, so the browser can say it in the
 * reader's own language; the message is the English of it.
 */
function fail(status: number, code: VoiceErrorCode, message: string): Response {
  return Response.json({ error: message, code }, { status });
}

/**
 * One passage, spoken aloud: free, and it needs no key.
 *
 * The browser cannot call either voice directly (the answers carry no CORS
 * header), so the request comes through here.
 */
export async function POST(req: Request) {
  let body: { text?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return fail(400, "badRequest", "Body must be JSON.");
  }
  const text = (body.text ?? "").trim();
  if (!text) return fail(400, "empty", "Nothing to read.");
  // Google Translate refuses more than 190 characters in one request. The
  // client splits longer passages up, so this is only a backstop.
  if (text.length > GTTS_MAX_CHARS) return fail(413, "tooLong", "That passage is too long to read in one go.");
  if (!allow(`voice:${clientId(req)}`, PER_MINUTE, 60_000)) {
    return fail(429, "tooMany", "That is a lot at once. Wait a moment, then try again.");
  }

  const r = await speak(text, body.lang, req.signal);
  if (!r.ok) return fail(502, r.code, voiceError(r.code));
  return new Response(r.buffer, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
