import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser, canEdit, canReview, canAdmin } from "@/lib/auth";
import { directDependencies, directDependents } from "@/lib/graph";
import { DocumentDetail } from "@/components/DocumentDetail";
import { docLabel, LOCK_TTL_MS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: { id: string; docId: string };
}) {
  const [user, doc, project] = await Promise.all([
    getCurrentUser(),
    prisma.document.findUnique({
      where: { id: params.docId },
      include: {
        updatedBy: { select: { name: true } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.project.findUnique({
      where: { id: params.id },
      include: {
        documents: { select: { id: true, type: true, title: true, status: true, outdated: true } },
        dependencies: true,
      },
    }),
  ]);

  if (!doc || !project || doc.projectId !== project.id) notFound();

  // Edit-lock state for the initial render (the lock itself is enforced
  // server-side in acquireEditLock; this is just the hint shown on load).
  const lockActive =
    !!doc.editingById && !!doc.editingAt && doc.editingAt.getTime() > Date.now() - LOCK_TTL_MS;
  const lock = {
    active: lockActive,
    byName: lockActive ? doc.editingByName : null,
    mine: lockActive && doc.editingById === user.id,
  };

  const edges = project.dependencies.map((d) => ({ sourceId: d.sourceId, targetId: d.targetId }));
  const byId = new Map(project.documents.map((d) => [d.id, d]));

  const upstream = directDependencies(doc.id, edges)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((d) => ({ id: d!.id, type: d!.type, status: d!.outdated ? "Outdated" : d!.status }));

  const downstream = directDependents(doc.id, edges)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((d) => ({ id: d!.id, type: d!.type, status: d!.outdated ? "Outdated" : d!.status }));

  // Other documents in the project, for the dependency pickers.
  const allDocs = project.documents
    .filter((d) => d.id !== doc.id)
    .map((d) => ({ id: d.id, type: d.type, title: d.title }));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={`/projects/${project.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"
      >
        <ArrowLeft size={14} /> {project.name}
      </Link>

      <DocumentDetail
        projectId={project.id}
        doc={{
          id: doc.id,
          type: doc.type,
          typeLabel: docLabel(doc.type),
          title: doc.title,
          status: doc.status,
          version: doc.version,
          outdated: doc.outdated,
          content: doc.content,
          updatedByName: doc.updatedBy?.name ?? null,
        }}
        upstream={upstream}
        downstream={downstream}
        allDocs={allDocs}
        attachments={doc.attachments.map((a) => ({
          id: a.id,
          filename: a.filename,
          mime: a.mime,
          size: a.size,
        }))}
        lock={lock}
        perms={{ canEdit: canEdit(user), canReview: canReview(user), canAdmin: canAdmin(user) }}
      />
    </div>
  );
}
