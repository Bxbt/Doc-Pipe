import Link from "next/link";
import { prisma } from "@/lib/db";
import { overallCompletion } from "@/lib/queries";
import { Card, ProgressBar, PageHeader, Button } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    include: { documents: { select: { status: true, updatedAt: true } } },
    orderBy: { updatedAt: "desc" },
  });
  // Order by most recent document activity (not just project-settings edits),
  // matching the dashboard's Project Progress. Fall back to project.updatedAt.
  const lastActivity = (p: (typeof projects)[number]) =>
    p.documents.reduce((max, d) => (d.updatedAt > max ? d.updatedAt : max), p.updatedAt);
  projects.sort((a, b) => lastActivity(b).getTime() - lastActivity(a).getTime());

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Every project bundles its documents into one connected pipeline."
        action={
          <Button href="/projects/new">
            <Plus size={16} /> New Project
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => {
          const completion = overallCompletion(p.documents);
          return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="flex h-full flex-col gap-3 transition-colors hover:border-brand/50">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-snug">{p.name}</h3>
                </div>
                <p className="line-clamp-2 text-xs text-muted">{p.description ?? "—"}</p>
                <div className="mt-auto space-y-2 pt-2">
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{p.businessType}</span>
                    <span>{p.documents.length} docs</span>
                  </div>
                  <ProgressBar value={completion} />
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{completion}% approved</span>
                    <span>ends {formatDate(p.endDate)}</span>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
