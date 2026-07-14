import { prisma } from "./db";
import { canAdmin, type CurrentUser } from "./auth";

// Project visibility / sharing access checks. One source of truth so every read
// path (dashboard, lists, pages, search, MCP token tools, attachments) gates the
// same way and a "private" project can't leak through a forgotten surface.
//
// Model: visibility "public" = every authenticated user; "private" = only
// ProjectMember rows + Admins. CRUD is still gated separately by global role.

// Prisma `where` fragment to AND into Project queries so only visible projects
// come back. Admins get no filter (see everything).
export function visibleProjectWhere(user: CurrentUser) {
  if (canAdmin(user)) return {};
  return {
    OR: [{ visibility: "public" }, { members: { some: { userId: user.id } } }],
  };
}

// Can this user SEE the project? public, or a member, or an Admin.
export async function canViewProject(user: CurrentUser, projectId: string): Promise<boolean> {
  if (canAdmin(user)) return true;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: { visibility: true, members: { where: { userId: user.id }, select: { id: true } } },
  });
  if (!p) return false;
  return p.visibility === "public" || p.members.length > 0;
}

// Can this user manage sharing (toggle visibility, add/remove members)?
// Owner of the project, or an Admin.
export async function canManageProject(user: CurrentUser, projectId: string): Promise<boolean> {
  if (canAdmin(user)) return true;
  const owner = await prisma.projectMember.findFirst({
    where: { projectId, userId: user.id, role: "owner" },
    select: { id: true },
  });
  return !!owner;
}
