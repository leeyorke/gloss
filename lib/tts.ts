/**
 * The voice, asked on the server.
 *
 * Two voices, neither of which needs a key or an account: Google Translate's,
 * which is the better one, and Baidu's, for when Google cannot be reached at
 * all. Baidu speaks fewer languages, but it answers from inside the network.
 *
 * The browser cannot call either one (the answers carry no CORS header), so
 * the request comes through here.
 */

import { APP_UA } from "./openrouter";
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
} from "./voice";

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
 * A language the caller knows beats guessing from the letters.
 */
export async function speak(
  text: string,
  lang?: string,
  signal?: AbortSignal
): Promise<{ ok: true; buffer: ArrayBuffer } | { ok: false; code: VoiceErrorCode }> {
  const language = lang?.trim() ? resolveLang(lang) : speechLang(text);
  const words = text.slice(0, GTTS_MAX_CHARS);

  let reason: VoiceErrorCode = "unreachable";
  let askedGoogle = false;
  if (googleWorthAsking()) {
    askedGoogle = true;
    const google = await ask(googleUrl(language, words), GOOGLE_TIMEOUT_MS, signal);
    if (google.ok) return google;
    reason = google.code;
    // Nothing came back at all: leave Google alone for a while.
    if (reason === "unreachable" || reason === "timeout") markGoogleDown();
  }

  const baidu = baiduLang(language);
  if (baidu) {
    const other = await ask(baiduTtsUrl(baidu, words), BAIDU_TIMEOUT_MS, signal);
    if (other.ok) return other;
    // When Google was asked and failed, its reason is the one worth giving:
    // the other voice may only have refused the language. When Google was
    // left alone, this is the only reason there is.
    if (!askedGoogle) reason = other.code;
  }
  return { ok: false, code: reason };
}

/** What a refusal says, in words. */
export function voiceError(code: VoiceErrorCode): string {
  if (code === "busy") return "The voice is busy. Try again in a moment.";
  if (code === "refused") return "The voice would not read that.";
  if (code === "timeout") return "The voice took too long to answer.";
  if (code === "noAnswer") return "The voice did not answer.";
  return "Could not reach the voice. Check your connection.";
}
