import { prisma } from "./db";
import { canEdit, type CurrentUser } from "./auth";
import { upstreamOf, type Edge } from "./graph";
import { docLabel, LOCK_TTL_MS } from "./constants";
import { bumpMinor } from "./versioning";
import { specForType } from "./doc-type-specs";

// Read/write operations exposed to external AI clients via the MCP API. Every
// function takes the caller (resolved from their token) explicitly, so the same
// role checks the web app uses apply here too.

async function edgesFor(projectId: string): Promise<Edge[]> {
  const deps = await prisma.documentDependency.findMany({ where: { projectId } });
  return deps.map((d) => ({ sourceId: d.sourceId, targetId: d.targetId }));
}

export async function listProjects() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      customer: true,
      businessType: true,
      _count: { select: { documents: true } },
    },
  });
  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    customer: p.customer,
    businessType: p.businessType,
    documentCount: p._count.documents,
  }));
}

export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { documents: { orderBy: { order: "asc" } } },
  });
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    customer: project.customer,
    businessType: project.businessType,
    description: project.description,
    documents: project.documents.map((d) => ({
      id: d.id,
      type: d.type,
      typeLabel: docLabel(d.type),
      title: d.title,
      status: d.outdated ? "Outdated" : d.status,
      version: d.version,
    })),
  };
}

// A single rich read for grounding: the document plus the concatenated content
// of everything upstream of it, plus the authoring spec for its type.
export async function getDocument(documentId: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) return null;

  const edges = await edgesFor(doc.projectId);
  const upstreamIds = [...upstreamOf(documentId, edges)];
  const upstreamDocs = upstreamIds.length
    ? await prisma.document.findMany({
        where: { id: { in: upstreamIds } },
        select: { type: true, title: true, content: true },
      })
    : [];

  const upstreamContext = upstreamDocs
    .map((u) => `## ${docLabel(u.type)} — ${u.title}\n\n${u.content}`)
    .join("\n\n---\n\n");

  return {
    id: doc.id,
    projectId: doc.projectId,
    type: doc.type,
    typeLabel: docLabel(doc.type),
    title: doc.title,
    status: doc.outdated ? "Outdated" : doc.status,
    version: doc.version,
    content: doc.content,
    typeSpec: specForType(doc.type),
    upstreamContext,
  };
}

function lockedByOther(doc: {
  editingById: string | null;
  editingByName: string | null;
  editingAt: Date | null;
}, userId: string): string | null {
  if (!doc.editingById || doc.editingById === userId || !doc.editingAt) return null;
  const fresh = doc.editingAt.getTime() > Date.now() - LOCK_TTL_MS;
  return fresh ? doc.editingByName ?? "another user" : null;
}

// Create a new document with AI-supplied content. Lands as Draft for review.
export async function createDocument(
  user: CurrentUser,
  projectId: string,
  type: string,
  title: string,
  content: string
) {
  if (!canEdit(user)) throw new Error("Editor access required to create documents.");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found.");

  const last = await prisma.document.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const doc = await prisma.document.create({
    data: {
      projectId,
      type,
      title: title.trim() || docLabel(type),
      status: "Draft",
      content,
      version: "v1.0",
      order: (last?.order ?? -1) + 1,
      updatedById: user.id,
    },
  });
  await prisma.documentVersion.create({
    data: { documentId: doc.id, version: "v1.0", content, note: "AI draft (MCP)", authorId: user.id },
  });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "added_document", detail: `${doc.title} (AI draft)` },
  });
  return { id: doc.id, status: doc.status, version: doc.version };
}

// Replace a document's content with an AI draft. Moves it to InReview (a human
// must approve) and does NOT ripple downstream — the change is unreviewed.
export async function updateDocument(user: CurrentUser, documentId: string, content: string) {
  if (!canEdit(user)) throw new Error("Editor access required to write documents.");
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Document not found.");

  const holder = lockedByOther(doc, user.id);
  if (holder) throw new Error(`Document is being edited by ${holder}; try again later.`);

  const newVersion = bumpMinor(doc.version);
  await prisma.document.update({
    where: { id: documentId },
    data: { content, version: newVersion, status: "InReview", outdated: false, updatedById: user.id },
  });
  await prisma.documentVersion.create({
    data: { documentId, version: newVersion, content, note: "AI draft (MCP)", authorId: user.id },
  });
  await prisma.activity.create({
    data: { projectId: doc.projectId, userId: user.id, action: "edited", detail: `${doc.title} (AI draft → In Review)` },
  });
  return { id: documentId, status: "InReview", version: newVersion };
}
