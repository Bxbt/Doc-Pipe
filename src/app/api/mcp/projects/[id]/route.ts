import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { getProject } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const project = await getProject(params.id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json(project);
}
