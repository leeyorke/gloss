import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/voice/route";
import { BAIDU_TIMEOUT_MS, GOOGLE_TIMEOUT_MS, resetVoiceState } from "@/lib/voice";

/** A request to the route, from a reader at `ip`. */
function ask(body: unknown, ip: string) {
  return new Request("http://localhost/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

/** The clip one of the voices answers with. */
function clip(): Response {
  return new Response("mp3-bytes", { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}

/** Which voice a URL belongs to. */
function isGoogle(url: string): boolean {
  return url.includes("translate.google.com");
}

describe("the voice", () => {
  let calls: string[] = [];
  let sent: RequestInit[] = [];

  beforeEach(() => {
    calls = [];
    sent = [];
    // Google is not always reachable, and what it answers with is not always
    // a clip: each test says what each voice does.
    resetVoiceState();
    vi.stubGlobal("fetch", async (url: unknown, init: RequestInit) => {
      calls.push(String(url));
      sent.push(init);
      return clip();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    resetVoiceState();
  });

  it("asks Google Translate for the words", async () => {
    const res = await POST(ask({ text: "The quick brown fox." }, "1.1.1.1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(await res.text()).toBe("mp3-bytes");
    const url = new URL(calls[0]);
    expect(url.origin + url.pathname).toBe("https://translate.google.com/translate_tts");
    expect(url.searchParams.get("ie")).toBe("UTF-8");
    expect(url.searchParams.get("client")).toBe("gtx");
    expect(url.searchParams.get("tl")).toBe("en-US");
    expect(url.searchParams.get("q")).toBe("The quick brown fox.");
    // The better voice answers, so the other one is not asked.
    expect(calls).toHaveLength(1);
  });

  it("asks for audio, and sends no credentials", async () => {
    await POST(ask({ text: "Hello." }, "1.1.1.2"));
    expect((sent[0].headers as Record<string, string>).Accept).toBe("audio/mpeg");
    expect(sent[0].credentials).toBeUndefined();
  });

  it("reads Chinese in Chinese", async () => {
    await POST(ask({ text: "今天天气很好。" }, "1.1.1.3"));
    expect(new URL(calls[0]).searchParams.get("tl")).toBe("zh-CN");
  });

  it("reads in the language it is given", async () => {
    await POST(ask({ text: "Bonjour.", lang: "fr" }, "1.1.1.4"));
    expect(new URL(calls[0]).searchParams.get("tl")).toBe("fr");
  });

  it("turns a three-letter code into a tag", async () => {
    await POST(ask({ text: "Hello.", lang: "eng" }, "1.1.1.5"));
    expect(new URL(calls[0]).searchParams.get("tl")).toBe("en-US");
  });

  it("has nothing to read", async () => {
    const res = await POST(ask({ text: "   " }, "1.1.1.6"));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("will not read more than one request's worth of text", async () => {
    const res = await POST(ask({ text: "a".repeat(191) }, "1.1.1.7"));
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("asks the other voice when Google cannot be reached", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => {
      calls.push(String(url));
      if (isGoogle(String(url))) throw new Error("connect timeout");
      return clip();
    });
    const res = await POST(ask({ text: "Hello." }, "1.1.1.8"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("mp3-bytes");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("fanyi.baidu.com");
    expect(new URL(calls[1]).searchParams.get("lan")).toBe("en");
  });

  it("asks the other voice when Google answers with a page of words", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => {
      calls.push(String(url));
      // A rate-limit page comes back as 200 and text/html.
      if (isGoogle(String(url))) return new Response("<html>too many requests</html>", { status: 200, headers: { "Content-Type": "text/html" } });
      return clip();
    });
    const res = await POST(ask({ text: "Hello." }, "1.1.1.9"));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("says the voice is busy when neither voice answers", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => {
      calls.push(String(url));
      return new Response("<html>too many requests</html>", { status: 200, headers: { "Content-Type": "text/html" } });
    });
    const res = await POST(ask({ text: "Hello." }, "1.1.1.10"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toMatch(/busy/i);
    expect(body.code).toBe("busy");
  });

  it("says so when it cannot reach the voice", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => {
      calls.push(String(url));
      throw new Error("connection refused");
    });
    const res = await POST(ask({ text: "Hello." }, "1.1.1.11"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toMatch(/connection/i);
    expect(body.code).toBe("unreachable");
  });

  it("gives up on a voice that does not answer in time", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      // A voice that never answers: only the timeout ends the wait.
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const pending = POST(ask({ text: "Hello." }, "1.1.1.12"));
    await vi.advanceTimersByTimeAsync(GOOGLE_TIMEOUT_MS + 500);
    await vi.advanceTimersByTimeAsync(BAIDU_TIMEOUT_MS + 500);
    const res = await pending;
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("timeout");
    expect(body.error).toMatch(/too long/i);
  });

  it("leaves Google alone for a while after it could not be reached", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => {
      calls.push(String(url));
      if (isGoogle(String(url))) throw new Error("connect timeout");
      return clip();
    });
    await POST(ask({ text: "First." }, "1.1.1.13"));
    expect(calls).toHaveLength(2);
    calls = [];
    // The second sentence goes straight to the voice that answered.
    await POST(ask({ text: "Second." }, "1.1.1.14"));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("fanyi.baidu.com");
  });

  it("has no other voice for a language the other one does not speak", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => {
      calls.push(String(url));
      throw new Error("connect timeout");
    });
    const res = await POST(ask({ text: "Bonjour.", lang: "fr" }, "1.1.1.15"));
    expect(res.status).toBe(502);
    expect(calls).toHaveLength(1);
  });
});
