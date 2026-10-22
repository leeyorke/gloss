import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ask/route";

type Sent = { model: string; messages: { role: string; content: string | null }[] };

/** What the model was asked, each time it was asked. */
let sent: Sent[] = [];

/** A request for a gloss of one paragraph, in a language. */
const ask = (locale?: string) =>
  new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      models: ["test/model:free"],
      locale,
      doc: { title: "On a Piece of Chalk", paras: [{ n: 1, text: "This is a very old and very interesting subject." }] },
      thread: { action: "explain", quote: "a very old subject" },
    }),
  });

/** The instruction that says which language to write in. */
const note = (messages: Sent["messages"]) => messages.find((m) => m.role === "system" && /Write the answer in/.test(m.content ?? ""))?.content ?? "";

beforeEach(() => {
  sent = [];
  process.env.OPENROUTER_API_KEY = "test-key";
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/models")) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "test/model:free",
              name: "Test Model",
              context_length: 8000,
              architecture: { output_modalities: ["text"] },
              pricing: { prompt: "0", completion: "0" },
              supported_parameters: [],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (u.endsWith("/chat/completions")) {
      sent.push(JSON.parse(String(init.body)) as Sent);
      const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: "==A gloss.==" } }] })}\n\n`;
      return new Response(`${frame}data: [DONE]\n\n`, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

describe("the language an answer is written in", () => {
  it("is the language the browser says the page is in", async () => {
    const res = await POST(ask("zh"));
    await res.text();
    expect(sent).toHaveLength(1);
    expect(note(sent[0].messages)).toMatch(/Simplified Chinese/);
  });

  it("is English when the page is in English", async () => {
    const res = await POST(ask("en"));
    await res.text();
    expect(note(sent[0].messages)).toMatch(/Write the answer in English/);
  });

  it("is the language the reader chose, when the browser says nothing", async () => {
    const req = new Request("http://localhost/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: "gloss_locale=zh" },
      body: JSON.stringify({
        models: ["test/model:free"],
        doc: { title: "On a Piece of Chalk", paras: [{ n: 1, text: "This is a very old and very interesting subject." }] },
        thread: { action: "explain", quote: "a very old subject" },
      }),
    });
    const res = await POST(req);
    await res.text();
    expect(note(sent[0].messages)).toMatch(/Simplified Chinese/);
  });

  it("does not change the text the model is given", async () => {
    await (await POST(ask("zh"))).text();
    const zh = sent[0].messages;
    sent = [];
    await (await POST(ask("en"))).text();
    const en = sent[0].messages;
    expect(zh[0]).toEqual(en[0]);
  });
});
