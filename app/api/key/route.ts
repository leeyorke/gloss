import { peekFree } from "@/lib/quota";
import { KEY_URL, openrouterHeaders } from "@/lib/openrouter";
import { readerKey } from "@/lib/seal";

export const runtime = "nodejs";

/** Validates a pasted key against OpenRouter. The key is never stored or logged. */
export async function POST(req: Request) {
  let body: { apiKey?: string; key?: string } = {};
  try {
    body = await req.json();
  } catch {}
  // The key comes sealed, so it is never in the request in the clear.
  const { key, error } = await readerKey(body);
  if (error) return Response.json({ ok: false, error }, { status: 400 });
  if (!key) return Response.json({ ok: false });
  try {
    const res = await fetch(KEY_URL, {
      headers: openrouterHeaders(key),
      signal: AbortSignal.timeout(10_000),
    });
    return Response.json({ ok: res.ok });
  } catch {
    return Response.json({ ok: false });
  }
}

/** Whether there is a shared key, and how much of today's free allowance is left on it. */
export async function GET(req: Request) {
  const house = Boolean(process.env.OPENROUTER_API_KEY);
  return Response.json({ house, free: house ? await peekFree(req) : null });
}
