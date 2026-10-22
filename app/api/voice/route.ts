import { allow, clientId } from "@/lib/ratelimit";
import { APP_UA } from "@/lib/together";
import {
  BAIDU_TIMEOUT_MS,
  GOOGLE_TIMEOUT_MS,
  GTTS_MAX_CHARS,
  GTTS_URL,
  baiduLang,
  baiduTtsUrl,
  googleWorthAsking,
  markGoogleDown,
  resolveLang,
  speechLang,
  type VoiceErrorCode,
} from "@/lib/voice";

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

/** The words, as Google wants them. */
function googleUrl(lang: string, text: string): string {
  const params = new URLSearchParams({ ie: "UTF-8", client: "gtx", tl: lang, q: text });
  return `${GTTS_URL}?${params.toString()}`;
}

/**
 * One voice, asked for the words: the bytes, or the reason there are none.
 *
 * The endpoint is anonymous, and no cookies are sent with it: anything sent
 * there would only leak the reader's own.
 */
async function ask(
  url: string,
  timeoutMs: number,
  client: AbortSignal | undefined
): Promise<{ ok: true; buffer: ArrayBuffer } | { ok: false; code: VoiceErrorCode }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  client?.addEventListener("abort", onAbort, { once: true });
  if (client?.aborted) controller.abort();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "audio/mpeg", "User-Agent": APP_UA },
    });
    if (!res.ok) {
      // 400 means the voice would not read it; 429 means it is busy with everyone else.
      if (res.status === 429) return { ok: false, code: "busy" };
      if (res.status === 400) return { ok: false, code: "refused" };
      return { ok: false, code: "noAnswer" };
    }
    // A rate-limit page comes back with 200 and text/html. Only the content-type
    // tells an audio clip from a page of words.
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!mime.startsWith("audio/")) return { ok: false, code: "busy" };
    return { ok: true, buffer: await res.arrayBuffer() };
  } catch {
    return { ok: false, code: controller.signal.aborted ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
    client?.removeEventListener("abort", onAbort);
  }
}

/**
 * One passage, spoken aloud: free, and it needs no key.
 *
 * The browser cannot call either voice directly (the answers carry no CORS
 * header), so the request comes through here.
 *
 * Google's voice is asked first, because it is the better one. Where it
 * cannot be reached at all, Baidu's voice answers instead — it speaks fewer
 * languages, but it answers from inside the network.
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

  // A language the caller knows beats guessing from the letters.
  const lang = body.lang?.trim() ? resolveLang(body.lang) : speechLang(text);
  const words = text.slice(0, GTTS_MAX_CHARS);

  let reason: VoiceErrorCode = "unreachable";
  let askedGoogle = false;
  if (googleWorthAsking()) {
    askedGoogle = true;
    const google = await ask(googleUrl(lang, words), GOOGLE_TIMEOUT_MS, req.signal);
    if (google.ok) return clip(google.buffer);
    reason = google.code;
    // Nothing came back at all: leave Google alone for a while.
    if (reason === "unreachable" || reason === "timeout") markGoogleDown();
  }

  // The other voice, for when the first one could not answer.
  const baidu = baiduLang(lang);
  if (baidu) {
    const other = await ask(baiduTtsUrl(baidu, words), BAIDU_TIMEOUT_MS, req.signal);
    if (other.ok) return clip(other.buffer);
    // When Google was asked and failed, its reason is the one worth giving:
    // the other voice may only have refused the language. When Google was
    // left alone, this is the only reason there is.
    if (!askedGoogle) reason = other.code;
  }

  // 400 means the voice would not read it; 429 means it is busy with everyone else.
  if (reason === "busy") return fail(502, "busy", "The voice is busy. Try again in a moment.");
  if (reason === "refused") return fail(502, "refused", "The voice would not read that.");
  if (reason === "timeout") return fail(502, "timeout", "The voice took too long to answer.");
  if (reason === "noAnswer") return fail(502, "noAnswer", "The voice did not answer.");
  return fail(502, "unreachable", "Could not reach the voice. Check your connection.");
}

/** The clip, as the browser plays it. */
function clip(buffer: ArrayBuffer): Response {
  return new Response(buffer, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
