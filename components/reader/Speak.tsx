"use client";

import { create } from "zustand";
import { speechLang, splitForSpeech, type VoiceErrorCode } from "@/lib/voice";
import type { TranslationKey } from "@/lib/i18n/translate";

/**
 * Read one passage aloud. The voice is Google Translate's, which is free: the
 * server asks it for the audio, and the browser plays it with Web Audio.
 *
 * Four things this has to get right, or it fails quietly:
 * 1. The audio context is made inside the click, before anything is waited
 *    for. Chrome leaves a context made later suspended, and says nothing.
 * 2. The clip is connected to the destination. A clip that is not connected
 *    plays to nowhere: no error, no sound.
 * 3. Audio that arrives after the reader stopped, or picked another passage,
 *    is thrown away.
 * 4. The words already asked for are kept, because the endpoint rate-limits
 *    hard and the same words are easy to ask for twice.
 */

type SpeakState = {
  speaking: boolean;
  error?: string;
  /** The words of the page, for the parts of the voice that live outside React. */
  t?: (key: TranslationKey) => string;
};

/** The state of the voice, for the button that starts it. */
export const useSpeak = create<SpeakState>(() => ({ speaking: false }));

/** The words of the page, for the parts of the voice that live outside React. */
function say(key: TranslationKey): string {
  const t = useSpeak.getState().t;
  return t ? t(key) : key;
}

/**
 * What the server said, said in the reader's own words.
 *
 * The server names each refusal it makes; here each name gets a sentence.
 * A refusal the browser does not know falls back to the plain one.
 */
const SPEAK_ERRORS: Partial<Record<VoiceErrorCode, TranslationKey>> = {
  unreachable: "reader.lens.speakUnreachable",
  timeout: "reader.lens.speakTimeout",
  busy: "reader.lens.speakBusy",
  refused: "reader.lens.speakRefused",
};

/** The sentence for a refusal, in the language the page is read in. */
function speakError(code?: VoiceErrorCode): string {
  const key = code ? SPEAK_ERRORS[code] : undefined;
  return say(key ?? "reader.lens.speakFailed");
}

/** A refusal from the server, with the name the server gave it. */
class VoiceRefusal extends Error {
  constructor(readonly code?: VoiceErrorCode) {
    super("The voice did not answer.");
  }
}

/* ---------------- the engine: one voice at a time ---------------- */

/** The token: audio that arrives after the reader moved on is thrown away. */
let session = 0;
let context: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let pending: { resolve: () => void } | null = null;

/** The audio already asked for, so the same words are not fetched twice. */
const cache = new Map<string, ArrayBuffer>();
const CACHE_LIMIT = 40;

/**
 * The audio context, made inside the click that asked for the words. Chrome
 * wants it created while the gesture is still alive.
 */
function audioContext(): AudioContext {
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

/** Stop whatever is being said. */
export function stopSpeaking() {
  session++;
  pending?.resolve();
  pending = null;
  if (source) {
    try {
      source.stop();
    } catch {}
    source.disconnect();
    source = null;
  }
  useSpeak.setState({ speaking: false, error: undefined });
}

/** Read a passage aloud: a sentence, or a highlighted one. */
export function speakAloud(text: string) {
  const chunks = splitForSpeech(text);
  if (!chunks.length) return;
  stopSpeaking();
  const s = ++session;
  // The context is made here, in the click, before anything is waited for.
  const ctx = audioContext();
  useSpeak.setState({ speaking: true, error: undefined });
  void playChunks(chunks, s, ctx);
}

async function playChunks(chunks: string[], s: number, ctx: AudioContext) {
  const lang = speechLang(chunks.join(" "));
  for (const chunk of chunks) {
    if (s !== session) return;
    let buffer: ArrayBuffer;
    try {
      buffer = await loadClip(chunk, lang);
    } catch (e) {
      if (s !== session) return;
      useSpeak.setState({ speaking: false, error: speakError(e instanceof VoiceRefusal ? e.code : undefined) });
      return;
    }
    if (s !== session) return;
    try {
      await playBuffer(buffer, s, ctx);
    } catch {
      if (s !== session) return;
      useSpeak.setState({ speaking: false, error: say("reader.lens.speakFailed") });
      return;
    }
  }
  if (s === session) useSpeak.setState({ speaking: false });
}

/**
 * The audio for one piece of the passage. The same words are asked for once:
 * the endpoint rate-limits hard, and a word is easy to ask for twice.
 */
async function loadClip(text: string, lang: string): Promise<ArrayBuffer> {
  const key = `${lang}\n${text}`;
  const cached = cache.get(key);
  // Decoding detaches the buffer it is given, so the cache keeps a copy.
  if (cached) return cached.slice(0);

  const res = await fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, lang }),
  });
  // The server names each refusal, so the reader can be told which one it was.
  if (!res.ok) throw new VoiceRefusal(await refusalCode(res));
  const buffer = await res.arrayBuffer();
  cache.set(key, buffer.slice(0));
  // The oldest goes first, in the order it was asked for.
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return buffer;
}

/** The name the server gave its refusal, if it gave one. */
async function refusalCode(res: Response): Promise<VoiceErrorCode | undefined> {
  try {
    const body = (await res.json()) as { code?: VoiceErrorCode };
    return body.code;
  } catch {
    return undefined;
  }
}

/** Decode one piece of audio and play it, and wait for it to end. */
async function playBuffer(buffer: ArrayBuffer, s: number, ctx: AudioContext): Promise<void> {
  const decoded = await ctx.decodeAudioData(buffer);
  if (s !== session) return;
  const node = ctx.createBufferSource();
  node.buffer = decoded;
  // Without this the clip plays to nowhere: no error, and no sound.
  node.connect(ctx.destination);
  await new Promise<void>((resolve) => {
    pending = { resolve };
    node.onended = () => {
      if (pending?.resolve === resolve) pending = null;
      if (source === node) source = null;
      resolve();
    };
    source = node;
    node.start();
  });
}
