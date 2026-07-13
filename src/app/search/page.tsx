import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { docLabel } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();

  // No query (e.g. the search box was cleared) — there's nothing to show, so
  // go back to the dashboard rather than a "type a query" dead end.
  if (!q) redirect("/");

  const [projects, documents] = await Promise.all([
    prisma.project.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
          { customer: { contains: q } },
        ],
      },
      take: 10,
    }),
    prisma.document.findMany({
      where: { OR: [{ title: { contains: q } }, { content: { contains: q } }] },
      include: { project: { select: { id: true, name: true } } },
      take: 20,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={`Search: "${q}"`}
        subtitle={`${projects.length} project(s) · ${documents.length} document(s)`}
      />

      {projects.length === 0 && documents.length === 0 ? (
        <EmptyState title="No results" hint="Try a different keyword." />
      ) : (
        <div className="flex flex-col gap-6">
          {projects.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Projects</h2>
              <div className="flex flex-col gap-2">
                {projects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`}>
                    <Card className="flex items-center justify-between transition-colors hover:border-brand/50">
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted">{p.customer ?? "—"}</div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {documents.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Documents</h2>
              <div className="flex flex-col gap-2">
                {documents.map((d) => (
                  <Link key={d.id} href={`/projects/${d.project.id}/documents/${d.id}`}>
                    <Card className="flex items-center justify-between transition-colors hover:border-brand/50">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{docLabel(d.type)}</div>
                        <div className="truncate text-xs text-muted">
                          {d.title} · {d.project.name}
                        </div>
                      </div>
                      <StatusBadge status={d.outdated ? "Outdated" : d.status} />
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
