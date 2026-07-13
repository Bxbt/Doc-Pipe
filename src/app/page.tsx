import Link from "next/link";
import {
  FolderKanban,
  FileText,
  AlertTriangle,
  Clock,
  FileWarning,
  Activity as ActivityIcon,
} from "lucide-react";
import { getDashboardData, overallCompletion } from "@/lib/queries";
import { Card, StatCard, ProgressBar, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/badges";
import { ActivityFeed } from "@/components/ActivityFeed";
import { docLabel } from "@/lib/constants";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your projects, documents, and what needs attention."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active Projects"
          value={data.activeProjects}
          hint={`${data.projects.length} total`}
          icon={<FolderKanban size={16} />}
        />
        <StatCard label="Total Documents" value={data.totalDocs} icon={<FileText size={16} />} />
        <StatCard
          label="Outdated Documents"
          value={data.outdatedDocs}
          tone={data.outdatedDocs ? "danger" : "good"}
          hint="impacted by changes"
          icon={<AlertTriangle size={16} />}
        />
        <StatCard
          label="Pending Review"
          value={data.inReviewDocs}
          tone={data.inReviewDocs ? "warn" : "default"}
          icon={<Clock size={16} />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Projects */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Project Progress</h2>
            <Link href="/projects" className="text-xs text-brand hover:underline">
              View all
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {data.projects.map((p) => {
              const completion = overallCompletion(p.documents);
              return (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <Card className="transition-colors hover:border-brand/50">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted">
                          {p.customer ?? "—"} · {p.documents.length} documents
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-28">
                          <div className="mb-1 text-right text-[11px] tabular-nums text-muted">
                            {completion}%
                          </div>
                          <ProgressBar value={completion} />
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <FileWarning size={15} className="text-amber-400" />
              <h2 className="text-sm font-semibold">Missing Recommended Documents</h2>
            </div>
            <Card>
              {data.missingCount === 0 ? (
                <p className="text-sm text-muted">All recommended documents are present 🎉</p>
              ) : (
                <p className="text-sm">
                  <span className="font-semibold text-amber-400">{data.missingCount}</span>{" "}
                  recommended document(s) are missing across your projects. Open a project to see
                  its Smart Checklist.
                </p>
              )}
            </Card>
          </div>
        </div>

        {/* Recent + activity */}
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="mb-3 text-sm font-semibold">Recently Updated</h2>
            <Card className="flex flex-col gap-3 p-4">
              {data.recentDocs.map((d) => (
                <Link
                  key={d.id}
                  href={`/projects/${d.project.id}/documents/${d.id}`}
                  className="flex items-center justify-between gap-2 text-sm hover:opacity-80"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{docLabel(d.type)}</div>
                    <div className="truncate text-[11px] text-muted">{d.project.name}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={d.outdated ? "Outdated" : d.status} />
                    <span className="text-[10px] text-muted">{timeAgo(d.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </Card>
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2">
              <ActivityIcon size={15} className="text-muted" />
              <h2 className="text-sm font-semibold">Recent Activity</h2>
            </div>
            <ActivityFeed activities={data.activities} />
          </div>
        </div>
      </div>
    </div>
  );
}
