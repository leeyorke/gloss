// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicKey, readerKey, unseal } from "@/lib/seal";
import { sealKey } from "@/lib/seal-client";

/**
 * A reader's key, sealed for the trip from the browser to the server.
 *
 * The browser's half runs here for real (the same WebCrypto calls the page
 * makes), and the server's half opens it.
 */

const KEY = "sk-api-key-of-the-reader";

/** The browser asks the server for its public key, once. */
beforeEach(() => {
  vi.stubGlobal("fetch", async () => Response.json({ key: await publicKey() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a sealed key", () => {
  it("does not carry the key in the clear", async () => {
    const sealed = await sealKey(KEY);
    expect(sealed).not.toContain(KEY);
    expect(sealed.startsWith("v1.")).toBe(true);
  });

  it("opens on the server", async () => {
    const sealed = await sealKey(KEY);
    expect(await unseal(sealed)).toBe(KEY);
  });

  it("is read by the route helper", async () => {
    const sealed = await sealKey(KEY);
    expect((await readerKey({ key: sealed })).key).toBe(KEY);
  });

  it("is a different seal every time", async () => {
    const one = await sealKey(KEY);
    const two = await sealKey(KEY);
    expect(one).not.toBe(two);
    expect(await unseal(one)).toBe(KEY);
    expect(await unseal(two)).toBe(KEY);
  });

  it("does not open when it is not one of ours", async () => {
    expect(await unseal("v1.not-a-key.not-a-key.not-a-key")).toBeNull();
    expect(await unseal("nonsense")).toBeNull();
  });

  it("says so when the seal cannot be opened", async () => {
    const { key, error } = await readerKey({ key: "v1.not-a-key.not-a-key.not-a-key" });
    expect(key).toBeUndefined();
    expect(error).toBeTruthy();
  });

  it("still takes a plain key, for a browser that could not seal it", async () => {
    expect((await readerKey({ apiKey: KEY })).key).toBe(KEY);
  });

  it("has no key when there is none", async () => {
    expect((await readerKey({})).key).toBeUndefined();
  });
});
