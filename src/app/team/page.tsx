import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PageHeader, Card } from "@/components/ui";
import { RoleBadge } from "@/components/badges";
import { RoleSelect } from "@/components/RoleSelect";

export const dynamic = "force-dynamic";

const ROLE_HELP: Record<string, string> = {
  Admin: "Manage users, roles, and projects",
  Editor: "Create and edit documents",
  Reviewer: "Approve documents",
  Viewer: "Read-only access",
};

export default async function TeamPage() {
  const [me, users] = await Promise.all([
    getCurrentUser(),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  const isAdmin = me.role === "Admin";

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={
          isAdmin
            ? "Authentication is handled by Cloudflare Access. Roles control what each member can do."
            : "Roles control what each member can do. Only Admins can change them."
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(ROLE_HELP).map(([role, help]) => (
          <Card key={role} className="p-4">
            <RoleBadge role={role} />
            <p className="mt-2 text-[11px] text-muted">{help}</p>
          </Card>
        ))}
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">Member</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">
                  {u.name}
                  {u.id === me.id && <span className="ml-2 text-[10px] text-muted">(you)</span>}
                </td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3">
                  {isAdmin ? <RoleSelect userId={u.id} role={u.role} /> : <RoleBadge role={u.role} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
