import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { linkDocuments, unlinkDocuments } from "@/lib/mcp";
import { decodeParam } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Add a dependency edge (targetId depends on sourceId).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (!body.sourceId || !body.targetId) {
    return Response.json({ error: "sourceId and targetId are required" }, { status: 400 });
  }
  try {
    return Response.json(await linkDocuments(user, decodeParam(params.id), body.sourceId, body.targetId));
  } catch (e: any) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}

// Remove a dependency edge.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (!body.sourceId || !body.targetId) {
    return Response.json({ error: "sourceId and targetId are required" }, { status: 400 });
  }
  return Response.json(await unlinkDocuments(user, decodeParam(params.id), body.sourceId, body.targetId));
}
