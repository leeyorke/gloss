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
type Call = { url: string; body: { model?: string; reasoning?: { effort?: string; enabled?: boolean } }; headers: Record<string, string> };

let calls: Call[] = [];

/** The stub: the catalogue comes back whole, and each chat answer is given by the test. */
function stub(answers: (() => Response)[], catalogue: unknown = CATALOGUE) {
  let n = 0;
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    const u = String(url);
    if (u.includes("/models")) return Response.json(catalogue);
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
    expect((await freeChain(["c/paid", "a/one:free"])).chain).toEqual(["a/one:free"]);
  });

  it("names the models it will not ask, so the reader is not left guessing", async () => {
    stub([() => Response.json({})]);
    const { freeChain } = await provider();
    const { chain, skipped } = await freeChain(["c/paid", "a/one:free"]);
    expect(chain).toEqual(["a/one:free"]);
    expect(skipped.map((s) => s.model)).toEqual(["Paid Model"]);
  });

  it("answers with its own choice when the reader has chosen nothing", async () => {
    stub([() => Response.json({})]);
    const { freeChain } = await provider();
    const { chain } = await freeChain([]);
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

  it("asks the next model when the first thinks out loud and sends its usage", async () => {
    // OpenRouter sends the usage with every answer, reasoning or not: a model
    // that only thinks has not answered, and the chain carries on.
    stub([
      () =>
        new Response(stream([{ choices: [{ delta: { reasoning: "thinking..." } }] }, { usage: { prompt_tokens: 6119, completion_tokens: 120 } }]), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      () => new Response(stream([content("An answer.")]), { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ]);
    const { streamChat } = await provider();
    const events = await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["a/one:free", "b/two:free"], apiKey: "sk-test" }) as never);
    expect(events.find((e) => e.type === "content")?.text).toBe("An answer.");
    expect(calls.length).toBe(2);
    // The reader is told which model answered, and which one was passed over.
    const meta = events.find((e) => e.type === "meta");
    expect(meta?.model).toBe("Model Two");
    expect((meta?.skipped as { model: string }[] | undefined)?.[0]?.model).toBe("Model One");
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
    // Every model that was asked is named, so the reader knows what happened
    // to the one they chose.
    const error = events.find((e) => e.type === "error")?.text ?? "";
    expect(error).toContain("Model One");
    expect(error).toContain("Model Two");
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

describe("how much a model is allowed to think", () => {
  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A catalogue with one model of each kind of thinker. */
  const THINKERS = {
    data: [
      { id: "quiet/model:free", name: "Quiet", supported_parameters: [], pricing: { prompt: "0", completion: "0" } },
      {
        id: "willing/model:free",
        name: "Willing",
        supported_parameters: ["reasoning"],
        pricing: { prompt: "0", completion: "0" },
        reasoning: { mandatory: false, default_enabled: true, supported_efforts: ["max", "high", "low", "minimal", "none"] },
      },
      {
        id: "forced/model:free",
        name: "Forced",
        supported_parameters: ["reasoning"],
        pricing: { prompt: "0", completion: "0" },
        reasoning: { mandatory: true, default_effort: "max", supported_efforts: ["max", "high", "medium", "low"] },
      },
    ],
  };

  /** The reasoning a request asked for. */
  const asked = () => (calls[0].body as { reasoning?: { effort?: string; enabled?: boolean } }).reasoning;

  const answer = () => new Response(stream([content("An answer.")]), { status: 200, headers: { "Content-Type": "text/event-stream" } });

  it("is nothing for a model that does not think", async () => {
    stub([answer], THINKERS);
    const { streamChat } = await provider();
    await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["quiet/model:free"], apiKey: "sk-test" }) as never);
    expect(asked()).toBeUndefined();
  });

  it("is none for a model that can answer without thinking", async () => {
    // A model that thinks by default spends four fifths of the budget on
    // thinking, and the answer has nothing left.
    stub([answer], THINKERS);
    const { streamChat } = await provider();
    await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["willing/model:free"], apiKey: "sk-test" }) as never);
    expect(asked()).toEqual({ effort: "none" });
  });

  it("is the cheapest it has, for a model that has to think", async () => {
    stub([answer], THINKERS);
    const { streamChat } = await provider();
    await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: ["forced/model:free"], apiKey: "sk-test" }) as never);
    expect(asked()).toEqual({ effort: "low" });
  });

  it("knows what the free models need", async () => {
    // The metadata OpenRouter reports for the free models, as it is.
    const REAL = {
      data: [
        {
          id: "thinkingmachines/inkling-small:free",
          name: "Inkling Small",
          supported_parameters: ["reasoning", "tools"],
          pricing: { prompt: "0", completion: "0" },
          reasoning: { mandatory: false, default_enabled: true, default_effort: "high", supported_efforts: ["max", "high", "medium", "low", "minimal", "none"] },
        },
        {
          id: "minimax/minimax-m3.1-flash:free",
          name: "MiniMax M3.1 Flash",
          supported_parameters: ["reasoning", "tools"],
          pricing: { prompt: "0", completion: "0" },
          reasoning: { mandatory: true, default_effort: "max", supported_efforts: ["max", "xhigh", "high", "medium", "low"] },
        },
        {
          id: "google/gemma-4-26b-a4b-it:free",
          name: "Gemma 4 26B A4B",
          supported_parameters: ["reasoning", "tools"],
          pricing: { prompt: "0", completion: "0" },
          reasoning: { mandatory: false, default_enabled: false },
        },
      ],
    };
    const effortFor = async (id: string) => {
      calls = [];
      stub([answer], REAL);
      const { streamChat } = await provider();
      await collect(streamChat({ messages: [{ role: "user", content: "hi" }], models: [id], apiKey: "sk-test" }) as never);
      return asked();
    };
    // Inkling thinks by default at "high": four fifths of the budget gone.
    expect(await effortFor("thinkingmachines/inkling-small:free")).toEqual({ effort: "none" });
    // MiniMax always thinks, and thinks hardest by default.
    expect(await effortFor("minimax/minimax-m3.1-flash:free")).toEqual({ effort: "low" });
    // Gemma does not think unless it is told to.
    expect(await effortFor("google/gemma-4-26b-a4b-it:free")).toBeUndefined();
  });
});
