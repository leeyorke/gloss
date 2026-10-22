import { publicKey } from "@/lib/seal";

export const runtime = "nodejs";

/**
 * The public key a reader's key is sealed with.
 *
 * It is public, so it is safe to cache: the browser asks for it once and
 * seals with it. The secret behind it never leaves the server.
 */
export async function GET() {
  const key = await publicKey();
  return Response.json({ key }, { headers: { "Cache-Control": "no-store" } });
}
