import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { getProjectFull, computeHealth, overallCompletion, missingDocs } from "@/lib/queries";
import { downstreamOf } from "@/lib/graph";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { WordBoiExport } from "@/components/WordBoiExport";
import { ShareControl } from "@/components/ShareControl";
import { formatDate } from "@/lib/utils";
import { getCurrentUser, canEdit, canAdmin } from "@/lib/auth";
import { getBusinessTypes } from "@/lib/business-types";
import { getDocTypeOptions } from "@/lib/doc-types";
import { docLabel, DOC_TYPE_MAP } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Traceability columns: requirement -> these downstream document types.
const TRACE_COLUMNS: { type: string; label: string }[] = [
  { type: "SRS", label: "SRS" },
  { type: "USER_STORY", label: "User Story" },
  { type: "API_SPEC", label: "API" },
  { type: "TEST_CASE", label: "Test Case" },
  { type: "UAT", label: "UAT" },
];

export default async function ProjectPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [data, user, businessTypes, docTypeOptions] = await Promise.all([
    getProjectFull(params.id),
    getCurrentUser(),
    getBusinessTypes(),
    getDocTypeOptions(),
  ]);
  if (!data) notFound();
  const { project, edges, unresolvedByDoc } = data;
  // Visibility gate: a private project is hidden from non-members (Admins see all).
  const isMember = project.members.some((m) => m.userId === user.id);
  if (project.visibility === "private" && !isMember && !canAdmin(user)) notFound();
  const canManage = canAdmin(user) || project.members.some((m) => m.userId === user.id && m.role === "owner");
  const docs = project.documents;
  const perms = { canEdit: canEdit(user), canAdmin: canAdmin(user) };

  const health = computeHealth(docs);
  const completion = overallCompletion(docs);
  const missing = missingDocs(project.businessType, docs);

  // Friendly labels for custom Document Library types (which may be Thai);
  // standard types fall back to their built-in name/short code.
  const typeLabelOf = (t: string) =>
    docTypeOptions.find((o) => o.type === t)?.label ?? docLabel(t);
  const typeShortOf = (t: string) =>
    DOC_TYPE_MAP[t]?.short ?? typeLabelOf(t).trim().slice(0, 3);

  const nodes = docs.map((d) => ({
    id: d.id,
    type: d.type,
    label: typeLabelOf(d.type),
    short: typeShortOf(d.type),
    status: d.status,
    outdated: d.outdated,
    gx: d.gx,
    gy: d.gy,
  }));

  const documentsLite = docs.map((d) => ({
    id: d.id,
    type: d.type,
    title: d.title,
    status: d.status,
    version: d.version,
    outdated: d.outdated,
    updatedAt: d.updatedAt.toISOString(),
    updatedByName: d.updatedBy?.name ?? null,
  }));

  // Build the requirement traceability matrix from the dependency graph.
  const requirements = docs.filter(
    (d) => d.type === "BUSINESS_REQUIREMENT" || d.type === "FUNCTIONAL_REQUIREMENT"
  );
  const rows = requirements.map((req) => {
    const downstream = downstreamOf(req.id, edges);
    const cells = TRACE_COLUMNS.map((col) => {
      const match = docs.find((d) => downstream.has(d.id) && d.type === col.type);
      return {
        type: col.type,
        label: col.label,
        status: match ? (match.outdated ? "Outdated" : match.status) : null,
      };
    });
    return { reqId: req.id, reqTitle: req.title, reqType: req.type, cells };
  });

  return (
    <div>
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg"
      >
        <ArrowLeft size={14} /> Projects
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{project.name}</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted">{project.description}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
            <span>Customer: {project.customer ?? "—"}</span>
            <span>Type: {project.businessType}</span>
            <span>{formatDate(project.startDate)} → {formatDate(project.endDate)}</span>
            <span>{docs.length} documents</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
        <div className="flex items-center gap-2">
          <ShareControl
            projectId={project.id}
            visibility={project.visibility}
            canManage={canManage}
            members={project.members.map((m) => ({
              userId: m.userId,
              name: m.user.name,
              email: m.user.email,
              role: m.role,
            }))}
          />
          <a
            href={`/projects/${project.id}/export`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
            title="Export all documents as one file (HTML, or print to PDF)"
          >
            <Download size={14} /> Export
          </a>
          <WordBoiExport projectId={project.id} />
        </div>
        </div>
      </div>

      <ProjectWorkspace
        projectId={project.id}
        project={{
          name: project.name,
          exportName: project.exportName ?? "",
          customer: project.customer,
          businessType: project.businessType,
          description: project.description,
          status: project.status,
          startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : "",
          endDate: project.endDate ? project.endDate.toISOString().slice(0, 10) : "",
          revisionHistory: project.revisionHistory,
        }}
        perms={perms}
        businessTypeNames={businessTypes.map((b) => b.name)}
        docTypeOptions={docTypeOptions}
        documents={documentsLite}
        unresolvedByDoc={unresolvedByDoc}
        nodes={nodes}
        edges={edges}
        health={health}
        completion={completion}
        missing={missing}
        traceability={{ columns: TRACE_COLUMNS.map((c) => c.label), rows }}
      />
    </div>
  );
}
