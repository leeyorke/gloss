/**
 * OpenRouter client. Server-side only. Raw fetch, OpenAI-compatible SSE.
 *
 * Things learned the hard way, kept on purpose:
 * 1. A named User-Agent, and the two headers OpenRouter asks an app to send.
 * 2. stream_options.include_usage, so the receipt is real, not a guess.
 * 3. Errors come back as JSON: surface error.message, not the raw body.
 * 4. A chain of models. The free ones come and go, and they rate limit each
 *    other, so the first model that answers is the one that answers and the
 *    ones behind it are only asked when the one before cannot.
 */

import { costFor, isFree, prettyModel, seedChain, type ChatMessage, type ModelInfo, type SkippedModel, type StreamEvent, type Usage } from "./models";

export type { ChatMessage, ModelInfo, StreamEvent, Usage } from "./models";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const MODELS_URL = "https://openrouter.ai/api/v1/models";
/** What a key says about itself. Used to check a pasted key. */
export const KEY_URL = "https://openrouter.ai/api/v1/key";
export const APP_UA = "Gloss/0.1";

/**
 * The headers OpenRouter asks an app to send: the site it is used from, and
 * the app's name.
 */
export function openrouterHeaders(apiKey?: string): Record<string, string> {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    "User-Agent": APP_UA,
    "HTTP-Referer": "https://pi.dev",
    "X-Title": "pi",
  };
}

/** The same, with the body of a request in it. */
function headers(apiKey: string): Record<string, string> {
  return { "Content-Type": "application/json", ...openrouterHeaders(apiKey) };
}

/* ---------------- the catalogue ---------------- */

/** How long the list of models is kept before it is fetched again. */
const TTL = 30 * 60_000;

type Entry = {
  id?: string;
  name?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  reasoning?: { mandatory?: boolean; default_enabled?: boolean; supported_efforts?: unknown[] };
};

let cached: { at: number; models: ModelInfo[] } | null = null;
let inflight: Promise<ModelInfo[]> | null = null;

/** Every model OpenRouter serves, kept for half an hour. */
export async function catalogue(): Promise<ModelInfo[]> {
  if (cached && Date.now() - cached.at < TTL) return cached.models;
  const p = (inflight ??= fetchCatalogue());
  try {
    return await p;
  } finally {
    if (inflight === p) inflight = null;
  }
}

async function fetchCatalogue(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(MODELS_URL, {
      headers: { ...openrouterHeaders(), Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return cached?.models ?? [];
    const j = (await res.json()) as { data?: Entry[] };
    const models = (j.data ?? []).map(toModel).filter((m): m is ModelInfo => m !== null);
    if (models.length) cached = { at: Date.now(), models };
    return models.length ? models : cached?.models ?? [];
  } catch {
    // No catalogue this time: the last one stands, if there was one.
    return cached?.models ?? [];
  }
}

function toModel(e: Entry): ModelInfo | null {
  const id = typeof e.id === "string" ? e.id : "";
  if (!id) return null;
  const out = e.architecture?.output_modalities ?? [];
  const input = e.architecture?.input_modalities ?? [];
  // Only models that answer in words and nothing else: one that draws or
  // sings cannot gloss a text.
  if (out.some((m) => m !== "text")) return null;
  if (out.length && !out.includes("text")) return null;
  const params = e.supported_parameters ?? [];
  const inPerM = Number(e.pricing?.prompt ?? 0);
  const outPerM = Number(e.pricing?.completion ?? 0);
  return {
    id,
    name: cleanName(e.name ?? id),
    context: Number(e.context_length ?? 0),
    tools: params.includes("tools"),
    vision: input.includes("image"),
    reasoning: params.includes("reasoning"),
    mandatoryReasoning: Boolean(e.reasoning?.mandatory),
    defaultReasoning: Boolean(e.reasoning?.default_enabled),
    efforts: Array.isArray(e.reasoning?.supported_efforts) ? e.reasoning.supported_efforts.filter((x): x is string => typeof x === "string") : [],
    json: params.includes("response_format") || params.includes("structured_outputs"),
    inPerM: Number.isFinite(inPerM) ? inPerM : 0,
    outPerM: Number.isFinite(outPerM) ? outPerM : 0,
  };
}

/** "DeepSeek: DeepSeek V3.1" reads better as "DeepSeek V3.1". */
function cleanName(name: string): string {
  const i = name.indexOf(": ");
  const tail = (i > 0 ? name.slice(i + 2) : name).replace(/\s*\(free\)\s*$/i, "").trim();
  return tail || name;
}

/** The free models: the ones that cost nothing to ask. */
export async function freeModels(): Promise<ModelInfo[]> {
  return (await catalogue()).filter(isFree);
}

/** One model, by its id. */
export async function modelInfo(id: string): Promise<ModelInfo | undefined> {
  return (await catalogue()).find((m) => m.id === id);
}

/** The name to show for a model. */
export async function labelFor(id: string): Promise<string> {
  return (await modelInfo(id))?.name ?? prettyModel(id);
}

/** The chain to try when the reader has not chosen one. */
export async function recommendedChain(): Promise<string[]> {
  return seedChain(await freeModels());
}

/**
 * The chain to try, from what the reader asked for. Only free models are let
 * through: the shared key pays for the answers, and a paid model on it would
 * be paid for out of the owner's pocket. The ones left out are named, so the
 * reader is not left wondering why their choice was not the one that answered.
 */
export async function freeChain(ids: string[]): Promise<{ chain: string[]; skipped: SkippedModel[] }> {
  const wanted = (ids ?? []).filter((id) => typeof id === "string" && id).slice(0, 10);
  const models = await catalogue();
  if (!models.length) {
    // No catalogue to check against: only ids that say they are free get through.
    return { chain: wanted.filter((id) => id.endsWith(":free")), skipped: [] };
  }
  const free = new Set(models.filter(isFree).map((m) => m.id));
  const chain = wanted.filter((id) => free.has(id));
  const skipped: SkippedModel[] = wanted
    .filter((id) => !free.has(id))
    .map((id) => ({ model: models.find((m) => m.id === id)?.name ?? prettyModel(id), reason: "It is not on the free list, so it is never asked." }));
  return chain.length ? { chain, skipped } : { chain: await recommendedChain(), skipped: [] };
}

/** Whether the first model in the chain can call tools. */
export async function chainUsesTools(models: string[]): Promise<boolean> {
  if (!models.length) return true;
  const info = await modelInfo(models[0]);
  return info ? info.tools : true;
}

/** Free models that can look at a picture, in the order they would be asked. */
const PREFERRED_VISION = [
  "google/gemini-2.0-flash-exp:free",
  "qwen/qwen2.5-vl-32b-instruct:free",
  "qwen/qwen-2.5-vl-32b-instruct:free",
  "google/gemini-2.5-flash-image:free",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
];

/** A free model that can read a picture, for a scanned page. */
export async function visionModel(): Promise<string | undefined> {
  const seen = (await freeModels()).filter((m) => m.vision);
  for (const id of PREFERRED_VISION) if (seen.some((m) => m.id === id)) return id;
  return seen.sort((a, b) => b.context - a.context)[0]?.id;
}

/* ---------------- the answers ---------------- */

/** What one model did: an event for the browser, or a failure worth trying the next model for. */
type Attempt = { kind: "event"; event: StreamEvent } | { kind: "failed"; error: string; retryable: boolean };

/** The statuses worth asking the next model for. */
const RETRYABLE = new Set([402, 404, 408, 409, 429, 500, 502, 503, 504]);

function errorMessage(status: number, body: string): string {
  let msg = body.slice(0, 280);
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    if (typeof j.error === "string") msg = j.error;
    else if (j.error?.message) msg = j.error.message;
    else if (j.message) msg = j.message;
  } catch {
    /* not JSON */
  }
  if (status === 401) return "OpenRouter rejected that API key. Check it and try again.";
  if (status === 402) return "That OpenRouter account has no credit left. Add your own key to keep going.";
  if (status === 429) return "OpenRouter is rate limiting this key. Wait a moment, or use your own key.";
  return `OpenRouter API ${status}: ${msg}`;
}

type Chunk = {
  error?: { message?: string } | string;
  choices?: { delta?: { content?: string; reasoning?: string; reasoning_content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

/**
 * Why no model in the chain answered: each one that was asked, and what it said.
 */
function chainFailure(failures: SkippedModel[]): string {
  if (!failures.length) return "No model in the chain answered.";
  return `No model in the chain answered. ${failures.map((f) => `${f.model}: ${f.reason}`).join(" ")}`;
}

/**
 * One answer, from the first model in the chain that can give one.
 *
 * The models behind the first are only asked when the one before could not
 * answer at all: it was rate limited, it is gone from the list, it thought out
 * loud and said nothing. A model that starts answering is left to finish.
 *
 * Every model that is passed over is remembered, and the reader is told: the
 * answer they get may come from a model they did not choose, and they are
 * entitled to know why their choice was not the one that answered.
 */
export async function* streamChat(req: {
  messages: ChatMessage[];
  /** The models to try, in order: the first that answers is the one that answers. */
  models: string[];
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Tools the model may call; a call ends the stream with a "tool" event instead of an answer. */
  tools?: readonly unknown[];
  /** "none" sends the tools (a conversation that already used one needs them) but asks for an answer. */
  toolChoice?: "auto" | "none";
  /** The models that are never asked at all, and why. */
  skipped?: SkippedModel[];
}): AsyncGenerator<StreamEvent> {
  const apiKey = req.apiKey?.trim() || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    yield { type: "error", text: "No OpenRouter API key. Set OPENROUTER_API_KEY, or add your own key." };
    return;
  }
  const chain = req.models?.length ? req.models : await recommendedChain();
  if (!chain.length) {
    yield { type: "error", text: "OpenRouter's free models could not be listed. Try again in a moment." };
    return;
  }

  const failures: SkippedModel[] = [...(req.skipped ?? [])];
  for (const id of chain) {
    const label = await labelFor(id);
    let said = false;
    let failure: string | null = null;
    for await (const a of streamOne({ ...req, model: id, apiKey })) {
      if (a.kind === "failed") {
        failure = a.error;
        break;
      }
      // Only an answer claims the model. A model that sends its usage and
      // nothing else has not answered, and the chain carries on to the next.
      if (!said && (a.event.type === "content" || a.event.type === "tool")) {
        said = true;
        yield { type: "meta", model: label, modelId: id, skipped: failures.length ? [...failures] : undefined };
      }
      yield a.event;
    }
    if (failure) failures.push({ model: label, reason: failure });
    // It failed after it had started answering: the reader has half an answer.
    if (failure && said) {
      yield { type: "error", text: `${label}: ${failure}` };
      return;
    }
    if (said) return;
  }
  yield { type: "error", text: chainFailure(failures) };
}

async function* streamOne(req: {
  messages: ChatMessage[];
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  tools?: readonly unknown[];
  toolChoice?: "auto" | "none";
}): AsyncGenerator<Attempt> {
  const info = await modelInfo(req.model);
  // A model that cannot call tools is not offered them.
  const tools = req.tools && (info ? info.tools : true) ? req.tools : undefined;
  // How much the model may think, so the answer has room in the budget.
  const reasoning = reasoningFor(info);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: req.signal,
      headers: headers(req.apiKey),
      body: JSON.stringify({
        model: req.model,
        stream: true,
        stream_options: { include_usage: true },
        temperature: req.temperature ?? 0.4,
        max_tokens: req.maxTokens ?? 900,
        ...(reasoning ? { reasoning } : {}),
        ...(tools ? { tools, tool_choice: req.toolChoice ?? "auto" } : {}),
        messages: req.messages,
      }),
    });
  } catch (e) {
    if (req.signal?.aborted) return;
    yield { kind: "failed", error: `Could not reach OpenRouter: ${String(e)}`, retryable: true };
    return;
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    yield { kind: "failed", error: errorMessage(res.status, body), retryable: RETRYABLE.has(res.status) };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawContent = false;
  let sawReasoning = false;
  // A tool call arrives in pieces, by index: its id and name once, its arguments in fragments.
  const calls: { id: string; name: string; args: string }[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.error) {
        const msg = typeof chunk.error === "string" ? chunk.error : chunk.error.message;
        yield { kind: "failed", error: msg || "OpenRouter could not answer that.", retryable: true };
        return;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.reasoning || delta?.reasoning_content) sawReasoning = true;
      for (const tc of delta?.tool_calls ?? []) {
        const c = (calls[tc.index] ??= { id: "", name: "", args: "" });
        if (tc.id) c.id = tc.id;
        if (tc.function?.name) c.name += tc.function.name;
        if (tc.function?.arguments) c.args += tc.function.arguments;
      }
      if (delta?.content) {
        sawContent = true;
        yield { kind: "event", event: { type: "content", text: delta.content } };
      }
      if (chunk.usage && typeof chunk.usage.completion_tokens === "number") {
        const pt = chunk.usage.prompt_tokens ?? 0;
        const cached = chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
        const ct = chunk.usage.completion_tokens ?? 0;
        yield {
          kind: "event",
          event: { type: "usage", usage: { promptTokens: pt, cachedTokens: cached, completionTokens: ct, costUsd: costFor(info, pt, cached, ct) } },
        };
      }
    }
  }

  if (calls[0]?.name) {
    yield { kind: "event", event: { type: "tool", id: calls[0].id || "call_0", name: calls[0].name, args: calls[0].args } };
    return;
  }
  if (!sawContent && sawReasoning) {
    // The model thought for the whole budget and wrote nothing.
    yield { kind: "failed", error: "It used the whole budget thinking and wrote nothing.", retryable: true };
    return;
  }
  yield { kind: "event", event: { type: "done" } };
}

/**
 * How much a model is allowed to think.
 *
 * Reasoning tokens come out of the same budget as the answer, and most
 * models think by default: OpenRouter reports the ones that do, and how hard.
 * A model left to itself spends four fifths of the budget on thinking, and
 * the answer has nothing left. A gloss is two or three sentences: the model
 * is told to think only where it has to, and as little as it can.
 */
function reasoningFor(info: ModelInfo | undefined, want?: boolean): { effort?: string; enabled?: boolean } | undefined {
  if (!info?.reasoning) return undefined; // the model does not think
  if (want) return { enabled: true }; // the caller asked for thinking: the brief does
  const efforts = info.efforts;
  if (efforts.includes("none")) return { effort: "none" }; // it can answer without thinking
  if (efforts.length) return { effort: efforts[efforts.length - 1] }; // the cheapest it has
  // Nothing to choose between: a model that thinks by default is asked to think as little as it can.
  return info.defaultReasoning ? { effort: "low" } : undefined;
}

/** Non-streaming JSON completion, for structured output like the brief. */
export async function completeJSON<T>(req: {
  messages: ChatMessage[];
  /** The models to try, in order: the first that answers is the one that answers. */
  models: string[];
  apiKey?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Let the model reason before it answers, for checking a text against itself. Its thinking spends from maxTokens. */
  thinking?: boolean;
  /** The models that are never asked at all, and why. */
  skipped?: SkippedModel[];
}): Promise<{ ok: true; data: T; usage: Usage; model: string; modelId: string } | { ok: false; error: string }> {
  const apiKey = req.apiKey?.trim() || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: "No OpenRouter API key. Set OPENROUTER_API_KEY, or add your own key." };
  const chain = req.models?.length ? req.models : await recommendedChain();
  if (!chain.length) return { ok: false, error: "OpenRouter's free models could not be listed. Try again in a moment." };

  // Every model that is passed over is named, so the reader knows why the
  // answer did not come from the one they chose.
  const failures: SkippedModel[] = [...(req.skipped ?? [])];
  for (const id of chain) {
    const r = await completeOne<T>({ ...req, model: id, apiKey });
    if (r.ok) return r;
    failures.push({ model: await labelFor(id), reason: r.error });
    // A key that is refused, or a request that is wrong, will fail the same way for every model.
    if (!r.retryable) break;
  }
  return { ok: false, error: chainFailure(failures) };
}

async function completeOne<T>(req: {
  messages: ChatMessage[];
  model: string;
  apiKey: string;
  maxTokens?: number;
  signal?: AbortSignal;
  thinking?: boolean;
}): Promise<{ ok: true; data: T; usage: Usage; model: string; modelId: string } | { ok: false; error: string; retryable: boolean }> {
  const info = await modelInfo(req.model);
  // The brief asks for thinking; everything else wants the answer, not the thinking.
  const reasoning = reasoningFor(info, req.thinking);
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: req.signal,
      headers: headers(req.apiKey),
      body: JSON.stringify({
        model: req.model,
        temperature: 0.3,
        max_tokens: req.maxTokens ?? 1400,
        ...(info?.json ? { response_format: { type: "json_object" } } : {}),
        ...(reasoning ? { reasoning } : {}),
        messages: req.messages,
      }),
    });
  } catch (e) {
    return { ok: false, error: `Could not reach OpenRouter: ${String(e)}`, retryable: true };
  }
  const body = await res.text();
  if (!res.ok) return { ok: false, error: errorMessage(res.status, body), retryable: RETRYABLE.has(res.status) };

  try {
    const j = JSON.parse(body) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const raw = j.choices?.[0]?.message?.content ?? "";
    const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const data = JSON.parse(jsonText) as T;
    const pt = j.usage?.prompt_tokens ?? 0;
    const cached = j.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const ct = j.usage?.completion_tokens ?? 0;
    return { ok: true, data, usage: { promptTokens: pt, cachedTokens: cached, completionTokens: ct, costUsd: costFor(info, pt, cached, ct) }, model: info?.name ?? prettyModel(req.model), modelId: req.model };
  } catch {
    return { ok: false, error: "The model returned something that was not valid JSON. Try again.", retryable: true };
  }
}
