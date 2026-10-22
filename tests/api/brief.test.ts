import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/brief/route";

type Sent = { model: string; messages: { role: string; content: string | null }[] };

/** What the model was asked, each time it was asked. */
let sent: Sent[] = [];

/** A request for the brief of one text, in a language. */
const ask = (locale?: string) =>
  new Request("http://localhost/api/brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      models: ["test/model:free"],
      locale,
      doc: { title: "On a Piece of Chalk", paras: [{ n: 1, text: "This is a very old and very interesting subject." }] },
    }),
  });

/** The instruction that says which language to write in. */
const note = (messages: Sent["messages"]) => messages.find((m) => m.role === "system" && /Write the gist/.test(m.content ?? ""))?.content ?? "";

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
              supported_parameters: ["structured_outputs"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (u.endsWith("/chat/completions")) {
      sent.push(JSON.parse(String(init.body)) as Sent);
      const brief = { gist: "A short text about a chalk.", claims: [], caveats: [], sections: [] };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(brief) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

describe("the language the brief is written in", () => {
  it("is the language the browser says the page is in", async () => {
    const res = await POST(ask("zh"));
    expect(res.status).toBe(200);
    expect(note(sent[0].messages)).toMatch(/Simplified Chinese/);
  });

  it("is English when the page is in English", async () => {
    await POST(ask("en"));
    expect(note(sent[0].messages)).toMatch(/Write the gist/);
    expect(note(sent[0].messages)).toMatch(/English/);
  });

  it("keeps the shape of the brief", async () => {
    await POST(ask("zh"));
    const last = sent[0].messages.at(-1)?.content ?? "";
    expect(last).toContain('"gist"');
    expect(last).toContain('"caveats"');
  });
});
