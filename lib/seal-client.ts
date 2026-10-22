"use client";

/**
 * A reader's key, sealed for the trip to the server.
 *
 * The key stays in the browser, and the server needs it to make the call, but
 * it never goes over the network in the clear: it is sealed with the server's
 * public key, and only the server can open it. Each seal carries its own key,
 * so a seal says nothing about any other.
 *
 * The seal is ECDH (P-256) with a key made for this one request, so the
 * server's public key is all the browser needs to know, and the server learns
 * nothing about the key until it opens the seal.
 */

const SALT = new TextEncoder().encode("gloss:api-key:salt:v1");
const INFO = new TextEncoder().encode("gloss:api-key:v1");

/** The field the key goes in, and its value: sealed when it can be. */
export type SealedKey = { field: "key" | "apiKey"; value: string };

let serverKey: Promise<CryptoKey> | null = null;

/** The server's public key, fetched once and kept for the session. */
function publicKey(): Promise<CryptoKey> {
  serverKey ??= fetch("/api/key/pub", { cache: "no-store" })
    .then((r) => r.json())
    .then(async (j: { key?: string }) => {
      if (!j.key) throw new Error("The server has no key to seal with.");
      return crypto.subtle.importKey("spki", fromBase64(j.key), { name: "ECDH", namedCurve: "P-256" }, false, []);
    })
    .catch((e) => {
      serverKey = null;
      throw e;
    });
  return serverKey;
}

/** The key both sides derive from the shared secret. */
async function derive(shared: ArrayBuffer): Promise<ArrayBuffer> {
  // HKDF, written out: extract, then one block of expand.
  const salt = await crypto.subtle.importKey("raw", SALT, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = await crypto.subtle.sign("HMAC", salt, shared);
  const key = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, INFO);
}

/**
 * Whether this browser can seal at all. The web crypto is only there in a
 * secure context: https, or localhost. On anything else the key goes as it
 * is, and the server takes it.
 */
export const canSeal = () => typeof crypto !== "undefined" && Boolean(crypto.subtle);

/** The key, sealed for the server. */
export async function sealKey(plain: string): Promise<string> {
  const server = await publicKey();
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: server }, ephemeral.privateKey, 256);
  const key = await crypto.subtle.importKey("raw", await derive(shared), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  const epk = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  return `v1.${toBase64(epk)}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

/** The key, ready to be sent: sealed where the browser can, plain where it cannot. */
export async function sealedKey(plain: string): Promise<SealedKey> {
  if (!canSeal()) {
    console.warn("This page is not a secure context: the key is sent as it is.");
    return { field: "apiKey", value: plain };
  }
  return { field: "key", value: await sealKey(plain) };
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
