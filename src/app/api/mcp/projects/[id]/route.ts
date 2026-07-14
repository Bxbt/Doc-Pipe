import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { getProject, updateProject } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const project = await getProject(params.id);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json(project);
}

export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  try {
    return Response.json(await updateProject(user, params.id, body));
  } catch (e: any) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
