import { allow, clientId } from "@/lib/ratelimit";
import { speak, voiceError } from "@/lib/tts";
import { GTTS_MAX_CHARS, type VoiceErrorCode } from "@/lib/voice";

export const runtime = "nodejs";
export const maxDuration = 30;

/** How many passages one reader may ask for in a minute: a page, read aloud. */
const PER_MINUTE = 120;

/**
 * A passage, spoken. The voice is Google Translate's, which is free and needs
 * no key, so reading aloud works for everyone who can read.
 */
export async function POST(req: Request) {
  let body: { text?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return Response.json({ error: "Nothing to read." }, { status: 400 });
  // The voice refuses more than 190 characters in one request. The reader
  // splits longer passages up, so this is only a backstop.
  if (text.length > GTTS_MAX_CHARS) return Response.json({ error: "That passage is too long to read in one go." }, { status: 413 });
  if (!allow(`speak:${clientId(req)}`, PER_MINUTE, 60_000)) {
    return Response.json({ error: "That is a lot at once. Wait a moment, then try again." }, { status: 429 });
  }

  const r = await speak(text, body.lang, req.signal);
  if (!r.ok) {
    const code: VoiceErrorCode = r.code;
    return Response.json({ error: voiceError(code), code }, { status: 502 });
  }
  return new Response(r.buffer, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
