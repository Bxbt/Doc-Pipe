import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { linkDocuments, unlinkDocuments } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// Add a dependency edge (targetId depends on sourceId).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (!body.sourceId || !body.targetId) {
    return Response.json({ error: "sourceId and targetId are required" }, { status: 400 });
  }
  try {
    return Response.json(await linkDocuments(user, params.id, body.sourceId, body.targetId));
  } catch (e: any) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}

// Remove a dependency edge.
export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (!body.sourceId || !body.targetId) {
    return Response.json({ error: "sourceId and targetId are required" }, { status: 400 });
  }
  return Response.json(await unlinkDocuments(user, params.id, body.sourceId, body.targetId));
}
