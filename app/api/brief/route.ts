import { briefMessages, type DocPayload } from "@/lib/prompts";
import { completeJSON, freeChain, modelInfo } from "@/lib/openrouter";
import { undash, type BriefData } from "@/lib/article";
import { chargeFree, checkFree, estimateUsd, needKey } from "@/lib/quota";
import { localeOfRequest } from "@/lib/i18n/request";
import { readerKey } from "@/lib/seal";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { apiKey?: string; key?: string; models?: string[]; doc?: DocPayload; locale?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const doc = body.doc;
  if (!doc?.title || !Array.isArray(doc.paras) || doc.paras.length === 0) {
    return Response.json({ error: "doc is required." }, { status: 400 });
  }
  // The brief is written in the language the reader is reading in.
  const locale = localeOfRequest(req, body.locale);

  // The reader's own key, opened from the seal the browser sent.
  const { key: own, error: keyError } = await readerKey(body);
  if (keyError) return Response.json({ error: keyError }, { status: 400 });
  const apiKey = own || undefined;
  // A gloss of the whole text spends from the same free allowance.
  let free: Awaited<ReturnType<typeof checkFree>> | null = null;
  if (!apiKey) {
    if (!process.env.OPENROUTER_API_KEY) return needKey(null);
    free = await checkFree(req);
    if (!free.ok) return needKey(free);
  }

  const { chain: models, skipped } = await freeChain(body.models ?? []);
  const result = await completeJSON<BriefData>({
    models,
    apiKey,
    signal: req.signal,
    skipped,
    // Thinking first: checking a text's headline figures against its own tables is arithmetic, and without it the
    // model repeats the abstract. About 10 s instead of 3 on a 14k-token paper, and half a cent more. The thinking
    // spends from max_tokens (up to 7k on that paper), so the budget is generous.
    thinking: true,
    maxTokens: 16000,
    messages: briefMessages(doc, locale),
  });
  if (free) {
    const chars = doc.paras.reduce((a, p) => a + (p.text?.length ?? 0), 0);
    await chargeFree(free.subject, result.ok ? result.usage.costUsd : estimateUsd(chars, (await modelInfo(models[0]))?.inPerM ?? 0));
  }
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });

  // Keep only well-formed, in-range items so the UI never links to nothing.
  const valid = new Set(doc.paras.map((p) => p.n));
  const d = result.data;
  // The shared system prompt asks glosses to ==mark== their answer; a brief has no use for it.
  const clean = (t: string) => undash(t).replace(/==/g, "");
  const cited = (list: unknown, max: number) =>
    (Array.isArray(list) ? (list as { text?: unknown; cite?: unknown }[]) : [])
      .filter((c): c is { text: string; cite?: unknown } => Boolean(c) && typeof c.text === "string" && c.text.trim().length > 0)
      .map((c) => ({ text: clean(c.text), cite: valid.has(Number(c.cite)) ? Number(c.cite) : 0 }))
      .slice(0, max);
  const brief: BriefData = {
    gist: clean(String(d.gist ?? "")),
    claims: cited(d.claims, 6),
    caveats: cited(d.caveats, 4),
    sections: (Array.isArray(d.sections) ? d.sections : [])
      .filter((s) => s && typeof s.title === "string" && valid.has(Number(s.start)))
      .map((s) => ({ title: clean(s.title), start: Number(s.start) }))
      .sort((a, b) => a.start - b.start)
      .slice(0, 10),
  };
  return Response.json({ brief, usage: result.usage, model: result.model, modelId: result.modelId }, { headers: free ? { "X-Free-Left": free.left.toFixed(3) } : undefined });
}
