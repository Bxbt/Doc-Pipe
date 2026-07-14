import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { reorderPipeline } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// Reorder the project's pipeline from an explicit list of document ids.
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.orderedDocumentIds)) {
    return Response.json({ error: "orderedDocumentIds (array) is required" }, { status: 400 });
  }
  try {
    return Response.json(await reorderPipeline(user, params.id, body.orderedDocumentIds));
  } catch (e: any) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
