import { freeModels } from "@/lib/openrouter";

export const runtime = "nodejs";

/**
 * The free models OpenRouter serves, for the reader to pick from. The list
 * changes from week to week, so it is fetched rather than written down.
 */
export async function GET() {
  const models = await freeModels();
  return Response.json({ models }, { headers: { "Cache-Control": "public, max-age=300" } });
}
