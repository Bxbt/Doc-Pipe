"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getCurrentUser, canEdit, canReview } from "./auth";
import { downstreamOf, type Edge } from "./graph";

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
