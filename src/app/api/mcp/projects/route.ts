import { authFromRequest, unauthorized } from "@/lib/mcp-auth";
import { listProjects } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await authFromRequest(req);
  if (!user) return unauthorized();
  return Response.json({ projects: await listProjects() });
}
