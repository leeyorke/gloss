// A check on a running Gloss: seal a key with the server's public key, post
// it, and see whether the server opens it. Run with the server up:
//
//   node scripts/seal-check.mjs [origin]
//
// The key it seals is not a real one: the server should open the seal, use
// the key, and then be told by OpenRouter that it is no good. Anything else
// means the seal did not travel.
const ORIGIN = process.argv[2] ?? process.env.GLOSS_ORIGIN ?? "http://127.0.0.1:3100";

const SALT = new TextEncoder().encode("gloss:api-key:salt:v1");
const INFO = new TextEncoder().encode("gloss:api-key:v1");
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const unb64 = (text) => new Uint8Array(Buffer.from(text, "base64"));

const pub = await (await fetch(`${ORIGIN}/api/key/pub`)).json();
const server = await crypto.subtle.importKey("spki", unb64(pub.key), { name: "ECDH", namedCurve: "P-256" }, false, []);
const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: server }, ephemeral.privateKey, 256);

// HKDF, the way the browser does it: extract, then one block of expand.
const salt = await crypto.subtle.importKey("raw", SALT, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const prk = await crypto.subtle.sign("HMAC", salt, shared);
const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const okm = await crypto.subtle.sign("HMAC", prkKey, INFO);
const aes = await crypto.subtle.importKey("raw", okm, { name: "AES-GCM" }, false, ["encrypt"]);

const iv = crypto.getRandomValues(new Uint8Array(12));
const plain = "sk-the-readers-own-key";
const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aes, new TextEncoder().encode(plain));
const epk = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
const sealed = `v1.${b64(epk)}.${b64(iv)}.${b64(new Uint8Array(ct))}`;

console.log("the payload carries the key in the clear:", sealed.includes(plain));

const res = await fetch(`${ORIGIN}/api/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    key: sealed,
    doc: { title: "On a Piece of Chalk", paras: [{ n: 1, text: "A very old subject." }] },
    thread: { action: "explain", quote: "a very old subject" },
  }),
});
const body = await res.text();
console.log("the server says:", res.status, body.slice(0, 240).replace(/\n/g, " "));
console.log("the server opened the seal:", !body.includes("could not be read"));
