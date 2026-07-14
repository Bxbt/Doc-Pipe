import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { getDocument, updateDocument } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const doc = await getDocument(params.id);
  if (!doc) return Response.json({ error: "Document not found" }, { status: 404 });
  return Response.json(doc);
}

// Replace a document's content with an AI draft (lands as In Review).
export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await authFromRequest(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  if (typeof body?.content !== "string") {
    return Response.json({ error: "`content` is required" }, { status: 400 });
  }
  try {
    const res = await updateDocument(user, params.id, body.content);
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
