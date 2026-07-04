import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { listBusinessTypes } from "@/lib/mcp";

export const dynamic = "force-dynamic";

// The business types available when creating a project, each with the document
// pipeline it scaffolds.
export async function GET(req: Request) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  return Response.json({ businessTypes: await listBusinessTypes() });
}
