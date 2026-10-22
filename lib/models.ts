/**
 * The shape of the model catalogue, and the wire types. Safe to import on the
 * client: no keys, no fetches. lib/openrouter.ts does the network side.
 *
 * There is no fixed list of models here any more: OpenRouter serves hundreds,
 * and the free ones change from week to week. The reader picks from the free
 * models the catalogue lists, in an order that says which one answers and
 * which ones stand behind it.
 */

/** An OpenRouter model id, e.g. "deepseek/deepseek-chat-v3.1:free". */
export type ModelId = string;

/** One model, as the catalogue gives it. */
export type ModelInfo = {
  id: ModelId;
  /** The name OpenRouter gives it, without the maker's prefix. */
  name: string;
  /** How much text it holds at once, in tokens. */
  context: number;
  /** Whether it can call tools (the web search). */
  tools: boolean;
  /** Whether it can look at a picture (a scanned page). */
  vision: boolean;
  /** Whether it can think before it answers. */
  reasoning: boolean;
  /** Whether it has to: a model that always thinks spends its budget thinking. */
  mandatoryReasoning: boolean;
  /** Whether it answers in JSON when it is asked to. */
  json: boolean;
  /** Dollars a million tokens: prompt in, completion out. A free model is 0. */
  inPerM: number;
  outPerM: number;
};

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type Usage = {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  costUsd: number;
};

/** A web result an answer can cite as [n]. */
export type Source = { n: number; title: string; url: string; site: string; date?: string };

export type StreamEvent =
  | { type: "meta"; model: string; modelId?: string }
  | { type: "searching" }
  /** The model asked for a tool (web search); the route runs it and asks again. Never sent to the browser. */
  | { type: "tool"; id: string; name: string; args: string }
  /** Drop what was written so far: a line before a tool call ("I'll look that up") that the real answer replaces. */
  | { type: "reset" }
  | { type: "sources"; sources: Source[] }
  | { type: "content"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done" }
  | { type: "error"; text: string };

/** A free model: one that costs nothing to ask. */
export const isFree = (m: ModelInfo): boolean => m.inPerM === 0 && m.outPerM === 0;

/**
 * A model id as a name, for the moments the catalogue does not know it:
 * "deepseek/deepseek-chat-v3.1:free" reads as "Deepseek Chat V3.1".
 */
export function prettyModel(id: string): string {
  const bare = id.replace(/:free$/, "");
  const tail = bare.includes("/") ? bare.slice(bare.indexOf("/") + 1) : bare;
  return tail
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Dollars for a run. A free model costs nothing, and says so. */
export function costFor(m: ModelInfo | undefined, prompt: number, cached: number, completion: number): number {
  if (!m) return 0;
  const fresh = Math.max(0, prompt - cached);
  return (fresh * m.inPerM + completion * m.outPerM) / 1_000_000;
}

/**
 * Models that answer well, in the order they would be asked, if they are
 * still on the free list. The list is a hint, not a promise: the catalogue
 * decides, and a model that has gone is simply not there.
 */
const PREFERRED = [
  "deepseek/deepseek-chat-v3.1:free",
  "google/gemini-2.0-flash-exp:free",
  "openai/gpt-oss-120b:free",
  "qwen/qwen3-235b-a22b:free",
  "qwen/qwen3-32b:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free",
];

/** OpenRouter's own router: it answers with a free model that is working. */
const ROUTER = "openrouter/free";

/** How many models a chain holds: the one that answers, and a few behind it. */
export const CHAIN_LENGTH = 4;

/**
 * The chain to start from: the router, then the models known to answer well,
 * then the rest of the free ones that can use tools, do not have to think, and
 * hold a lot of text. The first is the one that answers; the others are
 * fallbacks.
 */
export function seedChain(models: ModelInfo[]): string[] {
  const free = models.filter(isFree);
  const onList = new Set(free.map((m) => m.id));
  const chain: string[] = [];
  if (onList.has(ROUTER)) chain.push(ROUTER);
  for (const id of PREFERRED) if (onList.has(id)) chain.push(id);
  const rest = free
    .filter((m) => !chain.includes(m.id))
    .sort(
      (a, b) =>
        Number(b.tools) - Number(a.tools) ||
        Number(a.mandatoryReasoning) - Number(b.mandatoryReasoning) ||
        b.context - a.context ||
        a.id.localeCompare(b.id)
    );
  for (const m of rest) {
    if (chain.length >= CHAIN_LENGTH) break;
    chain.push(m.id);
  }
  return chain.slice(0, CHAIN_LENGTH);
}
