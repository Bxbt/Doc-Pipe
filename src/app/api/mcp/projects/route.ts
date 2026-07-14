import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { listProjects, createProject } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  return Response.json({ projects: await listProjects(user) });
}

export async function POST(req: Request) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  if (!body.name || !body.businessType) {
    return Response.json({ error: "name and businessType are required" }, { status: 400 });
  }
  try {
    const project = await createProject(user, body);
    return Response.json(project, { status: 201 });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? String(e) }, { status: 400 });
  }
}
