import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { DOC_TYPES } from "@/lib/constants";
import { specForType } from "@/lib/doc-type-specs";

export const dynamic = "force-dynamic";

// The document types available when creating a document, each with its
// authoring spec (format/conditions) for the AI to follow.
export async function GET(req: Request) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  return Response.json({
    docTypes: DOC_TYPES.map((d) => ({ type: d.type, label: d.label, spec: specForType(d.type) })),
  });
}
