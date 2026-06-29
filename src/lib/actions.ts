"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getCurrentUser, canEdit, canReview, canAdmin } from "./auth";
import { downstreamOf, type Edge } from "./graph";
import { DOC_TYPES, docLabel, type DocType } from "./constants";
import { TEMPLATES } from "./templates";

// Starter content for a new document — prefers the (editable) DB template
// matching the document type's label, falling back to the built-in template.
async function starterContentFor(type: string): Promise<string> {
  const label = docLabel(type);
  const dbTemplate = await prisma.template.findFirst({ where: { name: label } });
  if (dbTemplate) return dbTemplate.content;
  const builtin = TEMPLATES.find((x) => x.name === label);
  return builtin ? builtin.content : `# ${label}\n\n_Start writing…_`;
}

// The canonical pipeline used by "Generate standard pipeline".
// target depends on source (source --> target).
const STANDARD_EDGES: [DocType, DocType][] = [
  ["BUSINESS_REQUIREMENT", "FUNCTIONAL_REQUIREMENT"],
  ["BUSINESS_REQUIREMENT", "SRS"],
  ["BUSINESS_REQUIREMENT", "UAT"],
  ["FUNCTIONAL_REQUIREMENT", "SRS"],
  ["FUNCTIONAL_REQUIREMENT", "USER_STORY"],
  ["SRS", "FLOW_DIAGRAM"],
  ["SRS", "USER_STORY"],
  ["SRS", "DATABASE_DESIGN"],
  ["SRS", "API_SPEC"],
  ["FLOW_DIAGRAM", "USER_STORY"],
  ["USER_STORY", "API_SPEC"],
  ["USER_STORY", "TEST_CASE"],
  ["DATABASE_DESIGN", "API_SPEC"],
  ["API_SPEC", "TEST_CASE"],
  ["TEST_CASE", "UAT"],
  ["UAT", "DEPLOYMENT_CHECKLIST"],
  ["DEPLOYMENT_CHECKLIST", "RELEASE_NOTE"],
];

function bumpMinor(version: string): string {
  const m = version.match(/^v?(\d+)\.(\d+)$/);
  if (!m) return "v1.1";
  return `v${m[1]}.${Number(m[2]) + 1}`;
}

async function loadEdges(projectId: string): Promise<Edge[]> {
  const deps = await prisma.documentDependency.findMany({ where: { projectId } });
  return deps.map((d) => ({ sourceId: d.sourceId, targetId: d.targetId }));
}

// THE HERO ACTION:
// Mark a document as changed -> every downstream document becomes "Outdated".
export async function markChanged(projectId: string, documentId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to change a document.");

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Document not found.");

  const edges = await loadEdges(projectId);
  const impacted = [...downstreamOf(documentId, edges)];

  // Bump the changed document; it is itself up-to-date now.
  await prisma.document.update({
    where: { id: documentId },
    data: { version: bumpMinor(doc.version), outdated: false, updatedById: user.id },
  });

  // Flag all downstream documents as outdated.
  if (impacted.length) {
    await prisma.document.updateMany({
      where: { id: { in: impacted } },
      data: { outdated: true, status: "Outdated" },
    });
  }

  await prisma.activity.create({
    data: {
      projectId,
      userId: user.id,
      action: "marked_changed",
      detail: `${doc.title} changed — ${impacted.length} document(s) impacted`,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
  return { impacted: impacted.length };
}

// Clear the outdated flag once a document has been reconciled.
export async function resolveOutdated(projectId: string, documentId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access.");

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Document not found.");

  await prisma.document.update({
    where: { id: documentId },
    data: { outdated: false, status: "InReview", version: bumpMinor(doc.version), updatedById: user.id },
  });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "resolved_outdated", detail: doc.title },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
}

export async function saveDocument(projectId: string, documentId: string, content: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to edit documents.");

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Document not found.");

  const newVersion = bumpMinor(doc.version);
  await prisma.document.update({
    where: { id: documentId },
    data: { content, version: newVersion, updatedById: user.id },
  });
  await prisma.documentVersion.create({
    data: { documentId, version: newVersion, content, note: "Edited", authorId: user.id },
  });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "edited", detail: doc.title },
  });

  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function createProject(input: {
  name: string;
  customer?: string;
  businessType: string;
  description?: string;
}) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to create projects.");

  const project = await prisma.project.create({
    data: {
      name: input.name,
      customer: input.customer || null,
      businessType: input.businessType,
      description: input.description || null,
      status: "Active",
      members: { create: { userId: user.id } },
    },
  });
  await prisma.activity.create({
    data: { projectId: project.id, userId: user.id, action: "created_project", detail: input.name },
  });

  revalidatePath("/projects");
  revalidatePath("/");
  return project.id;
}

export async function setUserRole(userId: string, role: string) {
  const user = await getCurrentUser();
  if (user.role !== "Admin") throw new Error("Only Admins can change roles.");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/team");
}

export async function updateProject(
  projectId: string,
  input: { name?: string; customer?: string; businessType?: string; description?: string; status?: string }
) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to edit a project.");

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
    data: { projectId, userId: user.id, action: "updated_project", detail: input.name ?? "settings" },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function deleteProject(projectId: string) {
  const user = await getCurrentUser();
  if (!canAdmin(user)) throw new Error("Only Admins can delete a project.");
  // Cascades to documents, dependencies, members, activities via the schema.
  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function addDocument(projectId: string, type: string, title?: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to add documents.");

  const doc = await prisma.document.create({
    data: {
      projectId,
      type,
      title: title?.trim() || docLabel(type),
      status: "Draft",
      content: await starterContentFor(type),
      version: "v1.0",
      updatedById: user.id,
    },
  });
  await prisma.documentVersion.create({
    data: { documentId: doc.id, version: "v1.0", content: doc.content, note: "Created", authorId: user.id },
  });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "added_document", detail: doc.title },
  });

  revalidatePath(`/projects/${projectId}`);
  return doc.id;
}

export async function deleteDocument(projectId: string, documentId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to delete documents.");
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  // Dependency edges referencing this document cascade-delete via the schema.
  await prisma.document.delete({ where: { id: documentId } });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "deleted_document", detail: doc?.title ?? documentId },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function addDependency(projectId: string, sourceId: string, targetId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to link documents.");
  if (sourceId === targetId) throw new Error("A document cannot depend on itself.");

  const edges = await loadEdges(projectId);
  // Reject if this would create a cycle: source must not already be downstream of target.
  if (downstreamOf(targetId, edges).has(sourceId)) {
    throw new Error("That link would create a circular dependency.");
  }

  await prisma.documentDependency.upsert({
    where: { sourceId_targetId: { sourceId, targetId } },
    create: { projectId, sourceId, targetId },
    update: {},
  });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "linked_documents", detail: `${sourceId} → ${targetId}` },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents/${targetId}`);
}

export async function removeDependency(projectId: string, sourceId: string, targetId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to unlink documents.");
  await prisma.documentDependency
    .delete({ where: { sourceId_targetId: { sourceId, targetId } } })
    .catch(() => {});
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents/${targetId}`);
}

// One-click: create any missing standard documents and wire the standard pipeline.
export async function scaffoldPipeline(projectId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access.");

  const existing = await prisma.document.findMany({ where: { projectId } });
  const idByType: Record<string, string> = {};
  for (const d of existing) idByType[d.type] = d.id;

  // Create missing standard document types.
  for (const { type } of DOC_TYPES) {
    if (idByType[type]) continue;
    const doc = await prisma.document.create({
      data: {
        projectId,
        type,
        title: docLabel(type),
        status: "Draft",
        content: await starterContentFor(type),
        version: "v1.0",
        updatedById: user.id,
      },
    });
    idByType[type] = doc.id;
    await prisma.documentVersion.create({
      data: { documentId: doc.id, version: "v1.0", content: doc.content, note: "Scaffolded", authorId: user.id },
    });
  }

  // Wire standard dependencies (skip any that already exist).
  for (const [from, to] of STANDARD_EDGES) {
    const sourceId = idByType[from];
    const targetId = idByType[to];
    if (!sourceId || !targetId) continue;
    await prisma.documentDependency.upsert({
      where: { sourceId_targetId: { sourceId, targetId } },
      create: { projectId, sourceId, targetId },
      update: {},
    });
  }

  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "scaffolded_pipeline", detail: "Generated standard pipeline" },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function createTemplate(input: { name: string; description?: string; content?: string }) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to manage templates.");
  const t = await prisma.template.create({
    data: {
      name: input.name.trim() || "Untitled template",
      description: input.description?.trim() || "",
      content: input.content ?? "",
      builtin: false,
      sort: 999,
    },
  });
  revalidatePath("/templates");
  return t.id;
}

export async function updateTemplate(
  id: string,
  input: { name?: string; description?: string; content?: string }
) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to edit templates.");
  await prisma.template.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
    },
  });
  revalidatePath("/templates");
}

export async function deleteTemplate(id: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to delete templates.");
  await prisma.template.delete({ where: { id } });
  revalidatePath("/templates");
}

export async function setStatus(projectId: string, documentId: string, status: string) {
  const user = await getCurrentUser();
  if (status === "Approved" && !canReview(user))
    throw new Error("You need Reviewer access to approve documents.");
  if (!canEdit(user) && !canReview(user))
    throw new Error("You do not have permission to change status.");

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Document not found.");

  await prisma.document.update({
    where: { id: documentId },
    data: { status, outdated: status === "Outdated", updatedById: user.id },
  });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "set_status", detail: `${doc.title} → ${status}` },
  });

  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
  revalidatePath(`/projects/${projectId}`);
}
