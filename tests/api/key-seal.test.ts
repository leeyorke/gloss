// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ask/route";
import { publicKey } from "@/lib/seal";
import { sealKey } from "@/lib/seal-client";

/**
 * The reader's own key, from the browser to OpenRouter.
 *
 * The browser seals it, the server opens it, and OpenRouter is asked with it.
 * The key that arrives is the key that left: nothing about it changes on the
 * way, and the headers that say which app the request is from are still there.
 */

const KEY = "sk-the-readers-own-key";

type Sent = { model: string; headers: Record<string, string>; messages: { role: string; content: string | null }[] };

/** What OpenRouter was asked. */
let sent: Sent[] = [];

/** A request for a gloss, with the reader's key sealed. */
const ask = (sealed: string) =>
  new Request("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: sealed,
      doc: { title: "On a Piece of Chalk", paras: [{ n: 1, text: "This is a very old and very interesting subject." }] },
      thread: { action: "explain", quote: "a very old subject" },
    }),
  });

beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
    const u = String(url);
    // The browser asks the server for its public key.
    if (u.endsWith("/api/key/pub")) return Response.json({ key: await publicKey() });
    if (u.endsWith("/models")) {
      return Response.json({
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
      });
    }
    if (u.endsWith("/chat/completions")) {
      sent.push(JSON.parse(String(init.body)) as Sent);
      sent[sent.length - 1].headers = (init.headers ?? {}) as Record<string, string>;
      const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: "A gloss." } }] })}\n\n`;
      return new Response(`${frame}data: [DONE]\n\n`, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    return new Response("{}", { status: 404 });
  });
  process.env.OPENROUTER_API_KEY = "house-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OPENROUTER_API_KEY;
});

describe("the reader's own key", () => {
  it("reaches OpenRouter exactly as the reader wrote it", async () => {
    const sealed = await sealKey(KEY);
    expect(sealed).not.toContain(KEY);
    const res = await POST(ask(sealed));
    await res.text();
    expect(sent).toHaveLength(1);
    expect(sent[0].headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it("does not fall back to the house key when the reader has one", async () => {
    const res = await POST(ask(await sealKey(KEY)));
    await res.text();
    expect(sent[0].headers.Authorization).not.toContain("house-key");
  });

  it("still says which app the request is from", async () => {
    const res = await POST(ask(await sealKey(KEY)));
    await res.text();
    expect(sent[0].headers["HTTP-Referer"]).toBe("https://pi.dev");
    expect(sent[0].headers["X-Title"]).toBe("pi");
    expect(sent[0].headers["User-Agent"]).toBe("Gloss/0.1");
  });

  it("is refused when the seal is not one of ours", async () => {
    const res = await POST(ask("v1.not-a-key.not-a-key.not-a-key"));
    expect(res.status).toBe(400);
    expect(sent).toHaveLength(0);
  });
});
