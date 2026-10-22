import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The provider, with the network stubbed out: the catalogue it reads, and the
 * chain of models it tries when the first one cannot answer.
 */

/** The models OpenRouter would list: two free ones, one that costs money, one that only draws. */
const CATALOGUE = {
  data: [
    {
      id: "a/one:free",
      name: "One: Model One",
      context_length: 1000,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools", "response_format"],
    },
    {
      id: "b/two:free",
      name: "Two: Model Two",
      context_length: 2000,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools"],
    },
    {
      id: "c/paid",
      name: "Paid Model",
      context_length: 4000,
      architecture: { input_modalities: ["text"], output_modalities: ["text"] },
      pricing: { prompt: "1", completion: "2" },
      supported_parameters: ["tools"],
    },
    {
      id: "d/picture:free",
      name: "Picture Model",
      context_length: 8000,
      architecture: { input_modalities: ["image"], output_modalities: ["image"] },
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: [],
    },
  ],
};

/** A stream of chunks, as OpenRouter sends them. */
function stream(chunks: unknown[]): string {
  return chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
}

const content = (text: string) => ({ choices: [{ delta: { content: text } }] });

/** Everything a call did, so a test can say what was asked and what came back. */
type Call = { url: string; body: { model?: string }; headers: Record<string, string> };

let calls: Call[] = [];

/** The stub: the catalogue comes back whole, and each chat answer is given by the test. */
function stub(answers: (() => Response)[]) {
  let n = 0;
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    const u = String(url);
    if (u.includes("/models")) return Response.json(CATALOGUE);
    calls.push({ url: u, body: JSON.parse(String(init.body)) as { model?: string }, headers: (init.headers ?? {}) as Record<string, string> });
    const answer = answers[Math.min(n, answers.length - 1)];
    n++;
    return answer();
  });
}

/** A fresh copy of the provider, with an empty catalogue cache. */
async function provider() {
  vi.resetModules();
  return await import("@/lib/openrouter");
}

/** Everything a generator gave. */
async function collect(gen: AsyncGenerator<{ type: string; [k: string]: unknown }>) {
  const out: { type: string; [k: string]: unknown }[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("the model catalogue", () => {
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists only the free models that answer in words", async () => {
    stub([() => Response.json({})]);
    const { freeModels } = await provider();
    const models = await freeModels();
    expect(models.map((m) => m.id)).toEqual(["a/one:free", "b/two:free"]);
  });

  it("keeps the paid models out of the chain the reader asks for", async () => {
    stub([() => Response.json({})]);
    const { freeChain } = await provider();
    expect(await freeChain(["c/paid", "a/one:free"])).toEqual(["a/one:free"]);
  });

  it("answers with its own choice when the reader has chosen nothing", async () => {
    stub([() => Response.json({})]);
    const { freeChain } = await provider();
    const chain = await freeChain([]);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain).not.toContain("c/paid");
  });

  it("says which models can use tools and which can look at a picture", async () => {
    stub([() => Response.json({})]);
    const { modelInfo, visionModel } = await provider();
    expect((await modelInfo("a/one:free"))?.tools).toBe(true);
    expect((await modelInfo("a/one:free"))?.json).toBe(true);
    expect(await visionModel()).toBeUndefined();
  });
});

describe("the chain of models", () => {
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks the next model when the first is rate limited", async () => {
    stub([
      () => new Response("rate limited", { status: 429 }),
      () => new Response(stream([content("From the second one.")]), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ]);
    const { streamChat } = await provider();
    const events = await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["a/one:free", "b/two:free"], apiKey: "sk-test" }) as never);
    expect(calls.map((c) => c.body.model)).toEqual(["a/one:free", "b/two:free"]);
    expect(events.find((e) => e.type === "content")?.text).toBe("From the second one.");
    // The reader is told which model answered.
    expect(events.find((e) => e.type === "meta")?.model).toBe("Model Two");
  });

  it("asks the next model when the first answers only in its reasoning", async () => {
    stub([
      () => new Response(stream([{ choices: [{ delta: { reasoning: "thinking..." } }] }]), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      () => new Response(stream([content("An answer.")]), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ]);
    const { streamChat } = await provider();
    const events = await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["a/one:free", "b/two:free"], apiKey: "sk-test" }) as never);
    expect(events.find((e) => e.type === "content")?.text).toBe("An answer.");
    expect(calls.length).toBe(2);
  });

  it("leaves a model that has started answering to finish", async () => {
    stub([
      () => new Response(stream([content("Half an answer"), { choices: [{ delta: {} }], error: { message: "the stream broke" } }]), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      () => new Response(stream([content("A whole answer.")]), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ]);
    const { streamChat } = await provider();
    const events = await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["a/one:free", "b/two:free"], apiKey: "sk-test" }) as never);
    // The reader has half an answer: it is not thrown away for another model's.
    expect(events.find((e) => e.type === "content")?.text).toBe("Half an answer");
    expect(events.some((e) => e.type === "error")).toBe(true);
    expect(calls.length).toBe(1);
  });

  it("gives up when no model in the chain answers", async () => {
    stub([() => new Response("no", { status: 429 })]);
    const { streamChat } = await provider();
    const events = await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["a/one:free", "b/two:free"], apiKey: "sk-test" }) as never);
    expect(calls.length).toBe(2);
    expect(events.filter((e) => e.type === "error").length).toBe(1);
  });

  it("says which app the request is from", async () => {
    stub([() => new Response(stream([content("An answer.")]), { status: 200, headers: { "Content-Type": "text/event-stream" } })]);
    const { streamChat } = await provider();
    await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["a/one:free"], apiKey: "sk-test" }) as never);
    expect(calls[0].headers["HTTP-Referer"]).toBe("https://pi.dev");
    expect(calls[0].headers["X-Title"]).toBe("pi");
    expect(calls[0].headers["Authorization"]).toBe("Bearer sk-test");
  });
});
