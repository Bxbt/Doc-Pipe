import { prisma } from "./db";
import { canEdit, type CurrentUser } from "./auth";
import { upstreamOf, downstreamOf, type Edge } from "./graph";
import { docLabel, LOCK_TTL_MS } from "./constants";
import { bumpMinor } from "./versioning";
import { specForType } from "./doc-type-specs";
import { slugType } from "./doc-types";
import { newProjectId, newDocumentId } from "./slug";
import { TEMPLATES } from "./templates";
import { getBusinessTypes, getBusinessTypePipeline } from "./business-types";

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

  const docTitle = title.trim() || docLabel(type);
  const doc = await prisma.document.create({
    data: {
      id: await newDocumentId(docTitle),
      projectId,
      type,
      title: docTitle,
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
    data: { projectId, documentId: doc.id, userId: user.id, action: "added_document", detail: `${doc.title} (AI draft)` },
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
    data: { projectId: doc.projectId, documentId, userId: user.id, action: "edited", detail: `${doc.title} (AI draft → In Review)` },
  });
  return { id: documentId, status: "InReview", version: newVersion };
}

// Starter content for a scaffolded document: prefer a Document Library template
// (by label or slug), else the built-in template, else a stub. Mirrors the web
// app's own scaffolding so MCP-created projects look the same.
async function starterContentFor(type: string): Promise<string> {
  const label = docLabel(type);
  const dbTemplate = await prisma.template.findFirst({ where: { name: label } });
  if (dbTemplate) return dbTemplate.content;
  const all = await prisma.template.findMany({ select: { name: true, content: true } });
  const bySlug = all.find((t) => slugType(t.name) === type);
  if (bySlug) return bySlug.content;
  const builtin = TEMPLATES.find((x) => x.name === label);
  return builtin ? builtin.content : `# ${label}\n\n_Start writing…_`;
}

// The available business types and the document pipeline each one scaffolds.
// Lets an AI pick a valid businessType (and see what create_project will build).
export async function listBusinessTypes() {
  const types = await getBusinessTypes();
  return types.map((t) => ({
    name: t.name,
    documents: t.docTypes.map((d) => ({ type: d, label: docLabel(d) })),
  }));
}

// Scaffold a project's pipeline (documents in order + dependency edges) for its
// business type. Returns how many documents were created.
async function scaffoldPipeline(
  user: CurrentUser,
  projectId: string,
  businessType: string
): Promise<number> {
  const { docTypes, edges } = await getBusinessTypePipeline(businessType);
  const idByType: Record<string, string> = {};
  const usedIds = new Set<string>();

  let order = -1;
  for (const type of docTypes) {
    order += 1;
    const content = await starterContentFor(type);
    const id = await newDocumentId(docLabel(type), usedIds);
    usedIds.add(id);
    const doc = await prisma.document.create({
      data: {
        id,
        projectId,
        type,
        title: docLabel(type),
        status: "Draft",
        content,
        version: "v1.0",
        order,
        updatedById: user.id,
      },
    });
    idByType[type] = doc.id;
    await prisma.documentVersion.create({
      data: { documentId: doc.id, version: "v1.0", content, note: "Scaffolded (MCP)", authorId: user.id },
    });
  }

  for (const [from, to] of edges) {
    const sourceId = idByType[from];
    const targetId = idByType[to];
    if (!sourceId || !targetId) continue;
    await prisma.documentDependency.upsert({
      where: { sourceId_targetId: { sourceId, targetId } },
      create: { projectId, sourceId, targetId },
      update: {},
    });
  }
  return docTypes.length;
}

// Create a new project. By default it scaffolds the business type's document
// pipeline (like the web app), so the AI can then fill each document in.
export async function createProject(
  user: CurrentUser,
  input: {
    name: string;
    businessType: string;
    customer?: string;
    description?: string;
    scaffold?: boolean;
  }
) {
  if (!canEdit(user)) throw new Error("Editor access required to create projects.");
  const name = input.name?.trim();
  if (!name) throw new Error("Project name is required.");

  const project = await prisma.project.create({
    data: {
      id: await newProjectId(name),
      name,
      customer: input.customer?.trim() || null,
      businessType: input.businessType,
      description: input.description?.trim() || null,
      status: "Active",
      members: { create: { userId: user.id } },
    },
  });
  await prisma.activity.create({
    data: { projectId: project.id, userId: user.id, action: "created_project", detail: `${name} (via MCP)` },
  });

  const scaffoldedDocuments =
    input.scaffold === false ? 0 : await scaffoldPipeline(user, project.id, input.businessType);

  return {
    id: project.id,
    name,
    businessType: input.businessType,
    scaffoldedDocuments,
  };
}

// Add a dependency edge: targetId depends on sourceId (source is upstream of
// target). Rejects self-links, cross-project links, and any edge that would
// create a cycle — same guards as the web app. Does not flag anything Outdated.
export async function linkDocuments(
  user: CurrentUser,
  projectId: string,
  sourceId: string,
  targetId: string
) {
  if (!canEdit(user)) throw new Error("Editor access required to link documents.");
  if (sourceId === targetId) throw new Error("A document cannot depend on itself.");

  const docs = await prisma.document.findMany({
    where: { projectId },
    select: { id: true, type: true },
  });
  const labelById = new Map(docs.map((d) => [d.id, docLabel(d.type)]));
  if (!labelById.has(sourceId) || !labelById.has(targetId)) {
    throw new Error("Both documents must belong to the project.");
  }

  const edges = await edgesFor(projectId);
  if (downstreamOf(targetId, edges).has(sourceId)) {
    throw new Error("That link would create a circular dependency.");
  }

  await prisma.documentDependency.upsert({
    where: { sourceId_targetId: { sourceId, targetId } },
    create: { projectId, sourceId, targetId },
    update: {},
  });
  await prisma.activity.create({
    data: {
      projectId,
      documentId: targetId,
      userId: user.id,
      action: "linked_documents",
      detail: `${labelById.get(sourceId)} → ${labelById.get(targetId)} (via MCP)`,
    },
  });
  return { projectId, sourceId, targetId, linked: true };
}

// Remove a dependency edge (targetId no longer depends on sourceId). Idempotent.
export async function unlinkDocuments(
  user: CurrentUser,
  projectId: string,
  sourceId: string,
  targetId: string
) {
  if (!canEdit(user)) throw new Error("Editor access required to unlink documents.");
  const [src, tgt] = await Promise.all([
    prisma.document.findUnique({ where: { id: sourceId }, select: { type: true } }),
    prisma.document.findUnique({ where: { id: targetId }, select: { type: true } }),
  ]);
  const label = (d: { type: string } | null, id: string) => (d ? docLabel(d.type) : id);

  await prisma.documentDependency
    .delete({ where: { sourceId_targetId: { sourceId, targetId } } })
    .catch(() => {});
  await prisma.activity.create({
    data: {
      projectId,
      documentId: targetId,
      userId: user.id,
      action: "unlinked_documents",
      detail: `${label(src, sourceId)} ↛ ${label(tgt, targetId)} (via MCP)`,
    },
  });
  return { projectId, sourceId, targetId, unlinked: true };
}

// Reorder the pipeline from an explicit list of document ids (first = top).
// Ids not in the project are ignored; documents you omit keep their current
// relative order after the ones you listed. Returns the final id order.
export async function reorderPipeline(
  user: CurrentUser,
  projectId: string,
  orderedDocumentIds: string[]
) {
  if (!canEdit(user)) throw new Error("Editor access required to reorder the pipeline.");

  const docs = await prisma.document.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const existing = docs.map((d) => d.id);
  const idSet = new Set(existing);

  const seen = new Set<string>();
  const front: string[] = [];
  for (const id of orderedDocumentIds ?? []) {
    if (idSet.has(id) && !seen.has(id)) {
      seen.add(id);
      front.push(id);
    }
  }
  const finalOrder = [...front, ...existing.filter((id) => !seen.has(id))];

  await prisma.$transaction(
    finalOrder.map((id, i) => prisma.document.update({ where: { id }, data: { order: i } }))
  );
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "reordered_pipeline", detail: "Reordered via MCP" },
  });
  return { projectId, order: finalOrder };
}

// Update a project's metadata (no delete via MCP). Only provided fields change.
export async function updateProject(
  user: CurrentUser,
  projectId: string,
  input: {
    name?: string;
    customer?: string;
    businessType?: string;
    description?: string;
    status?: string;
  }
) {
  if (!canEdit(user)) throw new Error("Editor access required to edit a project.");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found.");

  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.customer !== undefined ? { customer: input.customer || null } : {}),
      ...(input.businessType !== undefined ? { businessType: input.businessType } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "updated_project", detail: input.name ?? "settings (via MCP)" },
  });
  return { id: projectId, updated: true };
}
