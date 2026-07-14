"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { getCurrentUser, canEdit, canReview, canAdmin, isBootstrapAdmin } from "./auth";
import { canManageProject } from "./access";
import { downstreamOf, type Edge } from "./graph";
import { docLabel } from "./constants";
import { slugType } from "./doc-types";
import { generateToken } from "./tokens";
import { bumpMinor, bumpPatch } from "./versioning";
import { TEMPLATES } from "./templates";
import { getBusinessTypePipeline } from "./business-types";
import { unlink } from "node:fs/promises";
import { LOCK_TTL_MS } from "./constants";
import { storedPath } from "./storage";

// Starter content for a new document — prefers the (editable) DB template
// matching the document type's label, falling back to the built-in template.
async function starterContentFor(type: string): Promise<string> {
  const label = docLabel(type);
  const dbTemplate = await prisma.template.findFirst({ where: { name: label } });
  if (dbTemplate) return dbTemplate.content;
  // Custom types come from Document Library entries whose name was slugged
  // into the type key ("Security Review" -> SECURITY_REVIEW). docLabel() of
  // such a type is the raw slug, so the exact-name lookup above misses them —
  // re-slug each template name to find the match.
  const all = await prisma.template.findMany({ select: { name: true, content: true } });
  const bySlug = all.find((t) => slugType(t.name) === type);
  if (bySlug) return bySlug.content;
  const builtin = TEMPLATES.find((x) => x.name === label);
  return builtin ? builtin.content : `# ${label}\n\n_Start writing…_`;
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
      documentId,
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
    data: { projectId, documentId, userId: user.id, action: "resolved_outdated", detail: doc.title },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
}

export async function saveDocument(
  projectId: string,
  documentId: string,
  content: string,
  opts: { minor?: boolean } = {}
) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to edit documents.");

  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Document not found.");

  // No-op save (editor opened and closed without real changes): just release
  // the lock. Don't bump the version or ripple downstream for nothing.
  if (content === doc.content) {
    await prisma.document.update({
      where: { id: documentId },
      data: { editingById: null, editingByName: null, editingAt: null },
    });
    revalidatePath(`/projects/${projectId}/documents/${documentId}`);
    return { impacted: 0 };
  }

  // Minor edit (typo/formatting): the author asserts downstream is unaffected.
  // Bump the patch number, leave status/outdated untouched, and skip the ripple.
  if (opts.minor) {
    const patched = bumpPatch(doc.version);
    await prisma.document.update({
      where: { id: documentId },
      data: {
        content,
        version: patched,
        updatedById: user.id,
        editingById: null,
        editingByName: null,
        editingAt: null,
      },
    });
    await prisma.documentVersion.create({
      data: { documentId, version: patched, content, note: "Minor edit", authorId: user.id },
    });
    await prisma.activity.create({
      data: { projectId, documentId, userId: user.id, action: "edited", detail: `${doc.title} (minor edit)` },
    });
    revalidatePath(`/projects/${projectId}/documents/${documentId}`);
    revalidatePath(`/projects/${projectId}`);
    return { impacted: 0 };
  }

  // Editing a document that others rely on carries automatic status flow:
  //  - Approved -> InReview  (the edit undoes the approval; needs re-review)
  //  - Outdated -> InReview  (editing it *is* the reconciliation)
  //  - Draft / InReview stay as-is (still being authored)
  const wasSettled = doc.status === "Approved" || doc.status === "Outdated";
  const newStatus = wasSettled ? "InReview" : doc.status;

  const newVersion = bumpMinor(doc.version);
  await prisma.document.update({
    where: { id: documentId },
    // Saving also releases this user's edit lock.
    data: {
      content,
      version: newVersion,
      status: newStatus,
      // The document we just edited is current by definition.
      outdated: false,
      updatedById: user.id,
      editingById: null,
      editingByName: null,
      editingAt: null,
    },
  });

  // Changing a settled document ripples through the graph: every downstream
  // document may now be stale, so flag it Outdated automatically — the same
  // effect as pressing "Mark changed", but without a manual step.
  let impacted: string[] = [];
  if (wasSettled) {
    const edges = await loadEdges(projectId);
    impacted = [...downstreamOf(documentId, edges)];
    if (impacted.length) {
      await prisma.document.updateMany({
        where: { id: { in: impacted } },
        data: { outdated: true, status: "Outdated" },
      });
    }
  }

  await prisma.documentVersion.create({
    data: { documentId, version: newVersion, content, note: "Edited", authorId: user.id },
  });
  await prisma.activity.create({
    data: {
      projectId,
      documentId,
      userId: user.id,
      action: "edited",
      detail: impacted.length
        ? `${doc.title} — ${impacted.length} downstream document(s) flagged`
        : doc.title,
    },
  });

  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
  revalidatePath(`/projects/${projectId}`);
  return { impacted: impacted.length };
}

// ── Pessimistic edit lock ─────────────────────────────────────────────────
// A document may be edited by one person at a time. The lock is refreshed by a
// client heartbeat; a lock with no heartbeat for LOCK_TTL_MS is considered
// stale and can be taken over, so a crashed/closed tab never deadlocks a doc.
function staleBefore() {
  return new Date(Date.now() - LOCK_TTL_MS);
}

// Try to acquire (or renew) the lock. Atomic: the conditional updateMany only
// succeeds if the doc is unlocked, already mine, or the existing lock is stale.
export async function acquireEditLock(documentId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to edit documents.");

  const res = await prisma.document.updateMany({
    where: {
      id: documentId,
      OR: [
        { editingById: null },
        { editingById: user.id },
        { editingAt: { lt: staleBefore() } },
      ],
    },
    data: { editingById: user.id, editingByName: user.name, editingAt: new Date() },
  });

  if (res.count > 0) return { ok: true as const };

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { editingByName: true },
  });
  return { ok: false as const, lockedBy: doc?.editingByName ?? "another user" };
}

// Renew the lock while editing. Returns ok:false if the lock was lost (e.g. it
// went stale and someone else took over) so the client can react.
export async function heartbeatEditLock(documentId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const };
  const res = await prisma.document.updateMany({
    where: { id: documentId, editingById: user.id },
    data: { editingAt: new Date() },
  });
  return { ok: res.count > 0 };
}

// Release the lock (Save/Cancel/leave). Only clears it if the caller holds it.
export async function releaseEditLock(documentId: string) {
  const user = await getCurrentUser();
  if (!user) return;
  await prisma.document.updateMany({
    where: { id: documentId, editingById: user.id },
    data: { editingById: null, editingByName: null, editingAt: null },
  });
}

// Admin escape hatch: force-clear a lock held by someone else.
export async function forceReleaseEditLock(projectId: string, documentId: string) {
  const user = await getCurrentUser();
  if (!canAdmin(user)) throw new Error("Admin access required to override a lock.");
  await prisma.document.updateMany({
    where: { id: documentId },
    data: { editingById: null, editingByName: null, editingAt: null },
  });
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
}

// Parse a "YYYY-MM-DD" string into a Date, or null when empty/invalid.
function toDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function createProject(input: {
  name: string;
  customer?: string;
  businessType: string;
  description?: string;
  startDate?: string;
  endDate?: string;
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
      startDate: toDate(input.startDate),
      endDate: toDate(input.endDate),
      members: { create: { userId: user.id, role: "owner" } },
    },
  });
  await prisma.activity.create({
    data: { projectId: project.id, userId: user.id, action: "created_project", detail: input.name },
  });

  revalidatePath("/projects");
  revalidatePath("/");
  return project.id;
}

// ── Project sharing (visibility + members) ─ owner or Admin only ────────────

async function assertCanManage(projectId: string) {
  const user = await getCurrentUser();
  if (!(await canManageProject(user, projectId)))
    throw new Error("Only the project owner or an Admin can manage sharing.");
  return user;
}

export async function setProjectVisibility(projectId: string, visibility: "public" | "private") {
  const user = await assertCanManage(projectId);
  await prisma.project.update({ where: { id: projectId }, data: { visibility } });
  await prisma.activity.create({
    data: { projectId, userId: user.id, action: "updated_project", detail: `visibility → ${visibility}` },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

export async function addProjectMember(projectId: string, userId: string) {
  await assertCanManage(projectId);
  // Idempotent — the (projectId, userId) unique constraint prevents duplicates.
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, role: "member" },
    update: {},
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectMember(projectId: string, userId: string) {
  await assertCanManage(projectId);
  // Never remove an owner (would orphan the project's management).
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  if (m?.role === "owner") throw new Error("Cannot remove the project owner.");
  await prisma.projectMember.deleteMany({ where: { projectId, userId } });
  revalidatePath(`/projects/${projectId}`);
}

// Directory of users to pick from when sharing (everyone who has signed in).
export async function listUsersForSharing() {
  await getCurrentUser();
  return prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

export async function setUserRole(userId: string, role: string) {
  const user = await getCurrentUser();
  if (!canAdmin(user)) throw new Error("Only Admins can change roles.");
  // An Admin can change anyone else's role (including other Admins), but:
  //  - not their own (no self-demote),
  //  - not a bootstrap Admin from ADMIN_EMAILS (they'd just be re-elevated).
  if (userId === user.id) throw new Error("You can't change your own role.");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!target) throw new Error("User not found.");
  if (isBootstrapAdmin(target.email))
    throw new Error("This account is a bootstrap admin (ADMIN_EMAILS) and can't be changed.");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/team");
}

// Update the current user's own profile. For now just the display name; more
// fields can follow. The name shows on activity, documents, and the user chip.
export async function updateProfile(input: { name: string }) {
  const user = await getCurrentUser();
  const name = input.name.trim();
  if (!name) throw new Error("Name cannot be empty.");
  if (name.length > 80) throw new Error("Name is too long.");
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/profile");
  revalidatePath("/");
  revalidatePath("/team");
  return { name };
}

export async function updateProject(
  projectId: string,
  input: {
    name?: string;
    exportName?: string;
    customer?: string;
    businessType?: string;
    description?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    revisionHistory?: string; // JSON string of revision rows
  }
) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to edit a project.");

  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.exportName !== undefined ? { exportName: input.exportName.trim() || null } : {}),
      ...(input.customer !== undefined ? { customer: input.customer || null } : {}),
      ...(input.businessType !== undefined ? { businessType: input.businessType } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.startDate !== undefined ? { startDate: toDate(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: toDate(input.endDate) } : {}),
      ...(input.revisionHistory !== undefined ? { revisionHistory: input.revisionHistory } : {}),
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

  const last = await prisma.document.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const doc = await prisma.document.create({
    data: {
      projectId,
      type,
      title: title?.trim() || docLabel(type),
      status: "Draft",
      content: await starterContentFor(type),
      version: "v1.0",
      order: (last?.order ?? -1) + 1,
      updatedById: user.id,
    },
  });
  await prisma.documentVersion.create({
    data: { documentId: doc.id, version: "v1.0", content: doc.content, note: "Created", authorId: user.id },
  });
  await prisma.activity.create({
    data: { projectId, documentId: doc.id, userId: user.id, action: "added_document", detail: doc.title },
  });

  revalidatePath(`/projects/${projectId}`);
  return doc.id;
}

export async function deleteAttachment(attachmentId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to delete attachments.");

  const att = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    include: { document: { select: { projectId: true } } },
  });
  if (!att) return;

  await prisma.attachment.delete({ where: { id: attachmentId } });
  try {
    await unlink(storedPath(att.storedName));
  } catch {
    // file already gone — ignore
  }
  await prisma.activity.create({
    data: { projectId: att.document.projectId, documentId: att.documentId, userId: user.id, action: "deleted_attachment", detail: att.filename },
  });
  revalidatePath(`/projects/${att.document.projectId}/documents/${att.documentId}`);
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

  const [src, tgt] = await Promise.all([
    prisma.document.findUnique({ where: { id: sourceId }, select: { type: true } }),
    prisma.document.findUnique({ where: { id: targetId }, select: { type: true } }),
  ]);
  const label = (d: { type: string } | null, id: string) => (d ? docLabel(d.type) : id);

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
      detail: `${label(src, sourceId)} → ${label(tgt, targetId)}`,
    },
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

// One-click: create missing documents and wire dependencies, using the
// pipeline defined for the project's business type.
export async function scaffoldPipeline(projectId: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access.");

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found.");

  const { docTypes, edges } = await getBusinessTypePipeline(project.businessType);

  const existing = await prisma.document.findMany({ where: { projectId } });
  const idByType: Record<string, string> = {};
  let maxOrder = -1;
  for (const d of existing) {
    idByType[d.type] = d.id;
    if (d.order > maxOrder) maxOrder = d.order;
  }

  // Create missing document types in pipeline order.
  for (const type of docTypes) {
    if (idByType[type]) continue;
    maxOrder += 1;
    const doc = await prisma.document.create({
      data: {
        projectId,
        type,
        title: docLabel(type),
        status: "Draft",
        content: await starterContentFor(type),
        version: "v1.0",
        order: maxOrder,
        updatedById: user.id,
      },
    });
    idByType[type] = doc.id;
    await prisma.documentVersion.create({
      data: { documentId: doc.id, version: "v1.0", content: doc.content, note: "Scaffolded", authorId: user.id },
    });
  }

  // Wire dependencies (skip any that already exist).
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

  await prisma.activity.create({
    data: {
      projectId,
      userId: user.id,
      action: "scaffolded_pipeline",
      detail: `Generated ${project.businessType} pipeline`,
    },
  });
  revalidatePath(`/projects/${projectId}`);
}

// Move a document up/down in the manual pipeline order (swaps with its neighbour).
export async function reorderDocument(projectId: string, documentId: string, direction: "up" | "down") {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to reorder documents.");

  const docs = await prisma.document.findMany({
    where: { projectId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const idx = docs.findIndex((d) => d.id === documentId);
  if (idx === -1) return;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= docs.length) return;

  // Normalise to sequential order, then swap the two positions.
  const ordered = docs.map((d) => d.id);
  [ordered[idx], ordered[swapWith]] = [ordered[swapWith], ordered[idx]];
  await prisma.$transaction(
    ordered.map((id, i) => prisma.document.update({ where: { id }, data: { order: i } }))
  );
  revalidatePath(`/projects/${projectId}`);
}

// ---- Business type management (editable generate-pipeline per type) ----

export async function createBusinessType(input: { name: string; docTypes: string[]; edges: [string, string][] }) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to manage business types.");
  const t = await prisma.businessType.create({
    data: {
      name: input.name.trim(),
      sort: 999,
      docTypes: JSON.stringify(input.docTypes ?? []),
      edges: JSON.stringify(input.edges ?? []),
    },
  });
  revalidatePath("/business-types");
  return t.id;
}

export async function updateBusinessType(
  id: string,
  input: { name?: string; docTypes?: string[]; edges?: [string, string][] }
) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to edit business types.");
  await prisma.businessType.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.docTypes !== undefined ? { docTypes: JSON.stringify(input.docTypes) } : {}),
      ...(input.edges !== undefined ? { edges: JSON.stringify(input.edges) } : {}),
    },
  });
  revalidatePath("/business-types");
}

export async function deleteBusinessType(id: string) {
  const user = await getCurrentUser();
  if (!canEdit(user)) throw new Error("You need Editor access to delete business types.");
  await prisma.businessType.delete({ where: { id } });
  revalidatePath("/business-types");
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
    data: { projectId, documentId, userId: user.id, action: "set_status", detail: `${doc.title} → ${status}` },
  });

  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
  revalidatePath(`/projects/${projectId}`);
}

// Bulk status change from the pipeline's multi-select. Setting a status other
// than "Outdated" clears the outdated flag, so selecting the over-flagged
// documents and choosing "In Review" reconciles them all in one step.
export async function setStatusMany(projectId: string, documentIds: string[], status: string) {
  const user = await getCurrentUser();
  if (status === "Approved" && !canReview(user))
    throw new Error("You need Reviewer access to approve documents.");
  if (!canEdit(user) && !canReview(user))
    throw new Error("You do not have permission to change status.");
  if (documentIds.length === 0) return { count: 0 };

  const res = await prisma.document.updateMany({
    where: { id: { in: documentIds }, projectId },
    data: { status, outdated: status === "Outdated", updatedById: user.id },
  });
  await prisma.activity.create({
    data: {
      projectId,
      userId: user.id,
      action: "set_status",
      detail: `${res.count} document(s) → ${status}`,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  return { count: res.count };
}

// ── Personal access tokens (for AI / MCP clients) ─────────────────────────
// A token acts as its owner: it carries that user's role, so a Viewer's token
// can only read. The raw value is returned once here and never stored.
export async function createAccessToken(name: string) {
  const user = await getCurrentUser();
  const { raw, tokenHash, preview } = generateToken();
  const token = await prisma.personalAccessToken.create({
    data: { userId: user.id, name: name.trim() || "Untitled token", tokenHash, preview },
  });
  revalidatePath("/settings");
  // `raw` is shown to the user exactly once; only the hash is persisted.
  return { id: token.id, raw };
}

export async function revokeAccessToken(id: string) {
  const user = await getCurrentUser();
  // deleteMany scoped to the owner so nobody can revoke another user's token.
  await prisma.personalAccessToken.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/settings");
}

// ---------------------------------------------------------------------------
// Comments
//
// Any signed-in user (Viewer included) may comment and resolve threads —
// comments are review feedback, not document edits. Editing or deleting an
// individual comment is limited to its author, or an Admin.
// ---------------------------------------------------------------------------

// Add a comment: with a threadId it is a reply (and reopens a resolved thread);
// without one it starts a new thread — doc-level, or anchored to a content
// block when anchorBlock/anchorQuote are supplied.
export async function addComment(
  projectId: string,
  documentId: string,
  input: { threadId?: string; body: string; anchorBlock?: number | null; anchorQuote?: string | null }
) {
  const user = await getCurrentUser();
  const body = input.body.trim();
  if (!body) throw new Error("Comment cannot be empty.");

  if (input.threadId) {
    const thread = await prisma.commentThread.findUnique({ where: { id: input.threadId } });
    if (!thread || thread.documentId !== documentId) throw new Error("Thread not found.");
    await prisma.comment.create({ data: { threadId: input.threadId, authorId: user.id, body } });
    if (thread.resolved) {
      await prisma.commentThread.update({
        where: { id: thread.id },
        data: { resolved: false, resolvedById: null, resolvedAt: null },
      });
    }
  } else {
    await prisma.commentThread.create({
      data: {
        documentId,
        createdById: user.id,
        anchorBlock: input.anchorBlock ?? null,
        anchorQuote: input.anchorQuote ?? null,
        comments: { create: { authorId: user.id, body } },
      },
    });
  }

  await prisma.activity.create({
    data: { projectId, documentId, userId: user.id, action: "commented", detail: body.slice(0, 80) },
  });
  revalidatePath(`/projects/${projectId}/documents/${documentId}`);
  revalidatePath(`/projects/${projectId}`);
}

export async function editComment(commentId: string, body: string) {
  const user = await getCurrentUser();
  const text = body.trim();
  if (!text) throw new Error("Comment cannot be empty.");
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { thread: { include: { document: { select: { id: true, projectId: true } } } } },
  });
  if (!comment) throw new Error("Comment not found.");
  if (comment.authorId !== user.id && !canAdmin(user)) {
    throw new Error("You can only edit your own comments.");
  }
  await prisma.comment.update({ where: { id: commentId }, data: { body: text, editedAt: new Date() } });
  const doc = comment.thread.document;
  revalidatePath(`/projects/${doc.projectId}/documents/${doc.id}`);
}

export async function deleteComment(commentId: string) {
  const user = await getCurrentUser();
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      thread: {
        include: {
          _count: { select: { comments: true } },
          document: { select: { id: true, projectId: true } },
        },
      },
    },
  });
  if (!comment) throw new Error("Comment not found.");
  if (comment.authorId !== user.id && !canAdmin(user)) {
    throw new Error("You can only delete your own comments.");
  }
  // Deleting the only comment removes the now-empty thread.
  if (comment.thread._count.comments <= 1) {
    await prisma.commentThread.delete({ where: { id: comment.threadId } });
  } else {
    await prisma.comment.delete({ where: { id: commentId } });
  }
  const doc = comment.thread.document;
  revalidatePath(`/projects/${doc.projectId}/documents/${doc.id}`);
  revalidatePath(`/projects/${doc.projectId}`);
}

export async function resolveThread(threadId: string, resolved: boolean) {
  const user = await getCurrentUser();
  const thread = await prisma.commentThread.findUnique({
    where: { id: threadId },
    include: { document: { select: { id: true, projectId: true, title: true } } },
  });
  if (!thread) throw new Error("Thread not found.");
  await prisma.commentThread.update({
    where: { id: threadId },
    data: {
      resolved,
      resolvedById: resolved ? user.id : null,
      resolvedAt: resolved ? new Date() : null,
    },
  });
  const doc = thread.document;
  await prisma.activity.create({
    data: {
      projectId: doc.projectId,
      documentId: doc.id,
      userId: user.id,
      action: resolved ? "resolved_comment" : "reopened_comment",
      detail: doc.title,
    },
  });
  revalidatePath(`/projects/${doc.projectId}/documents/${doc.id}`);
  revalidatePath(`/projects/${doc.projectId}`);
}

// ---------------------------------------------------------------------------
// Version compare
// ---------------------------------------------------------------------------

// Word-level HTML diff between two saved versions of a document. Read-only; any
// signed-in user may compare. Returns diff HTML (with <ins>/<del>) plus each
// side's version label for the header.
export async function diffVersions(documentId: string, oldId: string, newId: string) {
  await getCurrentUser();
  const [a, b] = await Promise.all([
    prisma.documentVersion.findFirst({ where: { id: oldId, documentId } }),
    prisma.documentVersion.findFirst({ where: { id: newId, documentId } }),
  ]);
  if (!a || !b) throw new Error("Version not found.");
  const { computeDiffHtml } = await import("./version-diff");
  return { html: computeDiffHtml(a.content, b.content), oldVersion: a.version, newVersion: b.version };
}

// Content of a single saved version — for "restore into editor" (the caller
// loads it into the editor and saves normally, so restore goes through the
// usual version-bump + downstream-ripple, and never overwrites silently).
export async function getVersionContent(documentId: string, versionId: string): Promise<string> {
  await getCurrentUser();
  const v = await prisma.documentVersion.findFirst({ where: { id: versionId, documentId } });
  if (!v) throw new Error("Version not found.");
  return v.content;
}
