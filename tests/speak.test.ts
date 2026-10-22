import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { speakAloud, stopSpeaking, useSpeak } from "@/components/reader/Speak";

/**
 * A Web Audio context that records what was done to it. The engine keeps one
 * for the whole file, so the tests below share it.
 */
type FakeNode = {
  buffer: unknown;
  onended: (() => void) | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
};

const nodes: FakeNode[] = [];
const destination = { id: "destination" };

const context = {
  state: "running",
  destination,
  resume: vi.fn(async () => {}),
  decodeAudioData: vi.fn(async () => ({ id: "decoded" })),
  createBufferSource: vi.fn(() => {
    const node: FakeNode = {
      buffer: null,
      onended: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      stop: vi.fn(),
      start: vi.fn(() => {
        setTimeout(() => node.onended?.(), 0);
      }),
    };
    nodes.push(node);
    return node;
  }),
};

/** The bytes of a clip, as the browser would get them. */
function clip(): Response {
  return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200, headers: { "Content-Type": "audio/mpeg" } });
}

describe("the voice", () => {
  beforeEach(() => {
    nodes.length = 0;
    // A constructor, not an arrow: it is called with new.
    vi.stubGlobal("AudioContext", vi.fn(function () {
      return context;
    }));
  });

  afterEach(() => {
    stopSpeaking();
    useSpeak.setState({ t: undefined, error: undefined });
    vi.unstubAllGlobals();
  });

  it("plays the clip through the destination", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => clip()));
    speakAloud("The quick brown fox jumps over the lazy dog.");
    await vi.waitFor(() => expect(nodes).toHaveLength(1));
    // A clip that is not connected plays to nowhere: no error, and no sound.
    expect(nodes[0].connect).toHaveBeenCalledWith(destination);
    expect(nodes[0].start).toHaveBeenCalled();
    expect(context.decodeAudioData).toHaveBeenCalled();
  });

  it("makes the context inside the click, before anything is waited for", () => {
    vi.stubGlobal("fetch", vi.fn(async () => clip()));
    speakAloud("Words read for the first time.");
    expect(context.destination).toBe(destination);
    expect(useSpeak.getState().speaking).toBe(true);
  });

  it("asks for the same words only once", async () => {
    const fetchMock = vi.fn(async () => clip());
    vi.stubGlobal("fetch", fetchMock);
    speakAloud("A sentence nobody has read today.");
    await vi.waitFor(() => expect(nodes).toHaveLength(1));
    speakAloud("A sentence nobody has read today.");
    await vi.waitFor(() => expect(nodes).toHaveLength(2));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws away audio that arrives after the reader stopped", async () => {
    let release: (r: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(() => pending));
    speakAloud("Words that arrive too late to be wanted.");
    stopSpeaking();
    release(clip());
    await new Promise((r) => setTimeout(r, 20));
    expect(nodes).toHaveLength(0);
    expect(useSpeak.getState().speaking).toBe(false);
  });

  it("tells the reader when the voice does not answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 502 })));
    speakAloud("Words that will not be heard.");
    await vi.waitFor(() => expect(useSpeak.getState().error).toBeTruthy());
    expect(useSpeak.getState().speaking).toBe(false);
  });

  it("says which refusal it was, in the reader's own words", async () => {
    useSpeak.setState({ t: (key) => `said:${key}` });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Could not reach the voice.", code: "unreachable" }), { status: 502, headers: { "Content-Type": "application/json" } })),
    );
    speakAloud("Words the server refused to read.");
    await vi.waitFor(() => expect(useSpeak.getState().error).toBeTruthy());
    expect(useSpeak.getState().error).toBe("said:reader.lens.speakUnreachable");
  });

  it("says the plain thing when the server names no refusal", async () => {
    useSpeak.setState({ t: (key) => `said:${key}` });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 502 })));
    speakAloud("Words the server said nothing about.");
    await vi.waitFor(() => expect(useSpeak.getState().error).toBeTruthy());
    expect(useSpeak.getState().error).toBe("said:reader.lens.speakFailed");
  });
});
