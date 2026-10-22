/**
 * A reader's OpenRouter key, sealed for the trip from their browser.
 *
 * The key is a bearer credential: whoever holds it can spend the reader's
 * money. It lives in their browser, and the server needs it to make their
 * calls, but it never crosses the network in the clear: the browser seals it
 * with the server's public key, and only the server can open it. Every seal
 * carries its own key, so one seal says nothing about any other.
 *
 * The keypair comes from a secret, so every instance of the app opens the
 * same seals: API_KEY_SECRET if it is set, else a secret kept in the
 * database, else a random one for this process (development).
 */

import { createDecipheriv, createECDH, createHash, createHmac, createPublicKey, randomBytes } from "node:crypto";
import { db } from "./db";

const CURVE = "prime256v1";
/** The salt and the label both sides derive the key with: they have to match. */
const SALT = Buffer.from("gloss:api-key:salt:v1");
const INFO = Buffer.from("gloss:api-key:v1");
/** The order of the curve: a private scalar has to be below it. */
const ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
/** What a sealed key looks like: version, the browser's key, the iv, the words. */
const VERSION = "v1";

let secretCache: Promise<string> | null = null;
let keyCache: Promise<{ scalar: Buffer; spki: Buffer }> | null = null;

/**
 * The secret the keypair is derived from: the same for every instance, so a
 * seal made for one instance can be opened by any of them.
 *
 * In order of preference: the secret the operator set, then the one kept in
 * the database, then one derived from the database's own address (which is
 * there in every real deployment and the same everywhere), and only then a
 * random one for this process — which no other instance can open, so it is
 * good enough for development and nothing more.
 */
function secret(): Promise<string> {
  secretCache ??= (async () => {
    const fromEnv = process.env.API_KEY_SECRET?.trim();
    if (fromEnv) return fromEnv;
    const stored = await storedSecret();
    if (stored) return stored;
    const url = process.env.DATABASE_URL?.trim();
    if (url) return `db:${createHmac("sha256", url).update(INFO).digest("hex")}`;
    console.warn("API_KEY_SECRET is not set and there is no database: the key seal is per process. Set API_KEY_SECRET before deploying.");
    return randomBytes(32).toString("base64");
  })();
  return secretCache;
}

/** The secret in the database, made once: every instance reads the same one. */
async function storedSecret(): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const rows = await db().query("select value from secrets where name = 'api_key'");
    if (rows.length) return String(rows[0].value);
    const value = randomBytes(32).toString("base64");
    // Two instances may arrive together: the first one to write wins.
    await db().query("insert into secrets (name, value) values ('api_key', $1) on conflict (name) do nothing", [value]);
    const again = await db().query("select value from secrets where name = 'api_key'");
    return String(again[0]?.value ?? value);
  } catch {
    return null;
  }
}

/** The private scalar, from the secret. It has to be a number the curve takes. */
function privateScalar(secret: string): Buffer {
  let d = createHash("sha256").update(secret).digest();
  for (;;) {
    const n = BigInt(`0x${d.toString("hex")}`);
    if (n > 0n && n < ORDER) return d;
    d = createHash("sha256").update(d).digest();
  }
}

/** The keypair: the scalar the server keeps, and the public key the browser seals with. */
function keypair() {
  keyCache ??= secret().then((s) => {
    const scalar = privateScalar(s);
    const ecdh = createECDH(CURVE);
    ecdh.setPrivateKey(scalar);
    const point = ecdh.getPublicKey();
    // The public key in the form a browser can import: SPKI, DER.
    const spki = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: point.subarray(1, 33).toString("base64url"), y: point.subarray(33, 65).toString("base64url") },
      format: "jwk",
    }).export({ type: "spki", format: "der" });
    return { scalar, spki: Buffer.from(spki) };
  });
  return keyCache;
}

/** The public key the browser seals with, base64 encoded. */
export async function publicKey(): Promise<string> {
  const { spki } = await keypair();
  return spki.toString("base64");
}

/** The key both sides derive from the shared secret. */
function derive(shared: Buffer): Buffer {
  const prk = createHmac("sha256", SALT).update(shared).digest();
  return createHmac("sha256", prk).update(INFO).digest();
}

/** The key inside a sealed payload, or null when it cannot be opened. */
export async function unseal(sealed: string): Promise<string | null> {
  const parts = sealed.trim().split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const { scalar } = await keypair();
    const ecdh = createECDH(CURVE);
    ecdh.setPrivateKey(scalar);
    const shared = ecdh.computeSecret(Buffer.from(parts[1], "base64"));
    const bytes = Buffer.from(parts[3], "base64");
    const decipher = createDecipheriv("aes-256-gcm", derive(shared), Buffer.from(parts[2], "base64"));
    decipher.setAuthTag(bytes.subarray(bytes.length - 16));
    return Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The reader's own key: opened from the sealed payload, or read from a plain
 * one (a tab that was open before the seal was in place, or a browser on an
 * origin with no crypto to seal with).
 */
export async function readerKey(body: { key?: string; apiKey?: string }): Promise<{ key?: string; error?: string }> {
  const sealed = body.key?.trim();
  if (sealed) {
    const open = await unseal(sealed);
    if (open) return { key: open.trim() || undefined };
    // The seal could not be opened: the server's secret is not the one the
    // browser sealed with. Say so, rather than answering with another key.
    return { error: "Your key could not be read. Reload the page and try again." };
  }
  return { key: body.apiKey?.trim() || undefined };
}
