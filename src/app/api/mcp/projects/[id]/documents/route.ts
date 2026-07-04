import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { createDocument } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// Create a new document (AI draft) in this project.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.type || typeof body.content !== "string") {
    return Response.json({ error: "`type` and `content` are required" }, { status: 400 });
  }
  try {
    const res = await createDocument(user, params.id, body.type, body.title ?? "", body.content);
    return Response.json(res, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
