import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser, canEdit, canReview } from "@/lib/auth";
import { directDependencies, directDependents } from "@/lib/graph";
import { DocumentDetail } from "@/components/DocumentDetail";
import { docLabel } from "@/lib/constants";

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
      include: { updatedBy: { select: { name: true } } },
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
        perms={{ canEdit: canEdit(user), canReview: canReview(user) }}
      />
    </div>
  );
}
