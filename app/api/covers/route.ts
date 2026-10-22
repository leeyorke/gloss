export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Painted covers are off for now: the picture was made by an image model on
 * Together, and OpenRouter has no free one that does that work. The drawing
 * itself is still in lib/paint.ts, ready to be pointed at an image model
 * when there is one to point it at.
 */
export async function POST() {
  return Response.json({ error: "Painted covers are off for now." }, { status: 503 });
}
