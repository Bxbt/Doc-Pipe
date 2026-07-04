import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { AccessTokenManager } from "@/components/AccessTokenManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const tokens = await prisma.personalAccessToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, preview: true, lastUsedAt: true, createdAt: true },
  });

  const tokensLite = tokens.map((t) => ({
    id: t.id,
    name: t.name,
    preview: t.preview,
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Personal access tokens for connecting AI / MCP clients to Doc-Pipe."
      />
      <AccessTokenManager tokens={tokensLite} role={user.role} />
    </div>
  );
}
