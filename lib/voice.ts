/**
 * Read aloud: Cartesia on Together. Sonic 3 is the newest Cartesia model
 * served serverless (Sonic 3.5 is listed, but only on dedicated endpoints;
 * checked 2026-10-09). Swap the id here when that changes.
 */
export const TTS_URL = "https://api.together.xyz/v1/audio/speech";
export const TTS_MODEL = "cartesia/sonic-3";
/** "Marian - Poised Narrator": even and unhurried, made for long reading. */
export const TTS_VOICE = "26403c37-80c1-4a1a-8692-540551ca2ae5";
/** One request's worth of text. Paragraphs past this are split at sentence ends. */
export const TTS_MAX_CHARS = 1200;

/**
 * Read one sentence aloud, free: Google Translate's own voice. It needs no key
 * and no account, and it is the voice behind the translate box on Google.
 * The browser cannot call it (the answer carries no CORS header), so it comes
 * through /api/voice instead.
 */
export const GTTS_URL = "https://translate.google.com/translate_tts";
/** One request's worth of text. Google Translate refuses anything longer. */
export const GTTS_MAX_CHARS = 190;

/**
 * Baidu's voice, for when Google cannot be reached.
 *
 * The endpoint is the one behind Baidu Translate's speaker button: no key, no
 * account, and it answers from inside the network, where Google does not. It
 * speaks Chinese, English, Japanese and Korean, and refuses the rest.
 */
export const BAIDU_TTS_URL = "https://fanyi.baidu.com/gettts";

/** The languages Baidu's voice speaks, and the codes it knows them by. */
const BAIDU_LANGS: Record<string, string> = {
  zh: "zh",
  "zh-cn": "zh",
  "zh-tw": "zh",
  "zh-hans": "zh",
  "zh-hant": "zh",
  en: "en",
  "en-us": "en",
  "en-gb": "en",
  ja: "jp",
  "ja-jp": "jp",
  ko: "kor",
  "ko-kr": "kor",
};

/**
 * The code Baidu knows a language by, or nothing if its voice cannot speak it.
 *
 * Baidu speaks four languages; the rest of the world has to make do with
 * Google, which is why this is a fallback and not the first choice.
 */
export function baiduLang(tag: string): string | null {
  const key = tag.toLowerCase();
  return BAIDU_LANGS[key] ?? BAIDU_LANGS[key.split("-")[0]] ?? null;
}

/** The URL for Baidu's voice, reading the words. */
export function baiduTtsUrl(lang: string, text: string): string {
  const params = new URLSearchParams({ lan: lang, text, spd: "5", vol: "9", per: "0" });
  return `${BAIDU_TTS_URL}?${params.toString()}`;
}

/**
 * How long Google has to answer before Baidu's voice is asked instead.
 *
 * Four seconds is far longer than either voice takes (well under a second,
 * usually) and short enough that a reader is not left waiting when Google
 * cannot be reached at all.
 */
export const GOOGLE_TIMEOUT_MS = 4_000;

/** How long Baidu's voice has to answer. */
export const BAIDU_TIMEOUT_MS = 8_000;

/**
 * How long Google is left alone after it could not be reached.
 *
 * One failed try is a fact worth keeping: without this, every sentence would
 * wait out the same timeout before the other voice answered.
 */
export const GOOGLE_COOLDOWN_MS = 5 * 60_000;

/** When Google last could not be reached, and until when it is left alone. */
let googleDownUntil = 0;

/** Is Google's voice worth asking just now? */
export function googleWorthAsking(): boolean {
  return Date.now() >= googleDownUntil;
}

/** Google could not be reached: leave it alone for a while. */
export function markGoogleDown(): void {
  googleDownUntil = Date.now() + GOOGLE_COOLDOWN_MS;
}

/** Test seam: forget that Google was unreachable. */
export function resetVoiceState(): void {
  googleDownUntil = 0;
}

/**
 * Why the voice did not answer, named so it can be said in the reader's own
 * words.
 *
 * The server sends one of these with every refusal; the browser has a
 * sentence for each of them, in every language Gloss speaks. A code the
 * browser does not know falls back to the plain "the voice did not answer".
 */
export const VOICE_ERROR_CODES = [
  "badRequest",
  "empty",
  "tooLong",
  "tooMany",
  "unreachable",
  "timeout",
  "busy",
  "refused",
  "noAnswer",
] as const;

/** One of the reasons the voice did not answer. */
export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

/**
 * A few hundred milliseconds of silence, played inside the click so phones
 * let the voice play later, once the clip has been fetched.
 */
export function silence(): string {
  const n = 800;
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  b.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true);
  b.setUint32(28, 16000, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  str(36, "data");
  b.setUint32(40, n * 2, true);
  let bin = "";
  new Uint8Array(b.buffer).forEach((x) => (bin += String.fromCharCode(x)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/** The languages Google speaks, by the three-letter code some data carries. */
const LANG_MAP: Record<string, string> = {
  eng: "en-US",
  fre: "fr-FR",
  fra: "fr-FR",
  zho: "zh-CN",
  spa: "es-ES",
  rus: "ru-RU",
  jpn: "ja",
  ita: "it-IT",
  kor: "ko",
  por: "pt-PT",
  ger: "de-DE",
  deu: "de-DE",
};

/**
 * The language tag to read in, from a code the data carries. Google wants
 * BCP-47, so "eng" becomes "en-US" and "zho-TW" becomes "zh-TW".
 */
export function resolveLang(code?: string): string {
  if (!code) return "en-US";
  const normalized = code.toLowerCase().replace(/_/g, "-");
  if (normalized === "eng" || normalized === "en") return "en-US";
  // Chinese, in either region.
  if (normalized === "zho" || normalized.startsWith("zh-") || normalized.startsWith("zho-")) {
    return normalized.includes("tw") || normalized.includes("hk") ? "zh-TW" : "zh-CN";
  }
  const mapped = LANG_MAP[normalized];
  if (mapped) return mapped;
  // Already a language tag: keep it as it is.
  if (/^[a-z]{2,3}(-[a-z0-9]+)*$/i.test(code)) return code;
  return "en-US";
}

/**
 * The language to read a passage in, guessed from the script it is written in:
 * a highlighted sentence does not say where it came from, so the letters are
 * the only honest signal. Kana is looked for first, or Japanese, which is
 * written with han too, would be read as Chinese.
 */
export function speechLang(text: string): string {
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  if (!letters) return "en-US";
  const share = (pattern: RegExp) => (text.match(pattern) ?? []).length / letters;
  if (share(/[\u3040-\u30ff]/g) > 0.2) return "ja";
  if (share(/[\uac00-\ud7af]/g) > 0.2) return "ko";
  if (share(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) > 0.2) return "zh-CN";
  if (share(/[\u0400-\u04ff]/g) > 0.5) return "ru-RU";
  if (share(/[\u0600-\u06ff]/g) > 0.5) return "ar";
  if (share(/[\u0e00-\u0e7f]/g) > 0.5) return "th";
  return "en-US";
}

/** The sentences of a passage, the space after each one left out. */
function sentences(text: string): string[] {
  return text.match(/[^.!?。！？]+[.!?。！？]*|[^.!?。！？]+$/g) ?? [text];
}

/** Words, packed into pieces of at most `limit` characters. */
function pack(sentence: string, limit: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of sentence.split(" ")) {
    if (!w) continue;
    if (cur && cur.length + 1 + w.length > limit) {
      out.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * One request's worth of text, cut at sentence ends, and at word ends when a
 * sentence is longer than a request, so that no word is split in half. A
 * passage that fits is left whole.
 */
export function splitForSpeech(text: string, limit = GTTS_MAX_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  const out: string[] = [];
  let cur = "";
  for (const sentence of sentences(clean)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length > limit) {
      // A sentence longer than a request: cut it at word ends.
      if (cur) {
        out.push(cur);
        cur = "";
      }
      out.push(...pack(trimmed, limit));
      continue;
    }
    const next = cur ? `${cur} ${trimmed}` : trimmed;
    if (next.length > limit) {
      out.push(cur);
      cur = trimmed;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}
