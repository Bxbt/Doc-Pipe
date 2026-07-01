import type { PrismaClient } from "@prisma/client";
import type { DocType } from "../src/lib/constants";

// The demo project is Doc-Pipe documenting *itself* — a more honest showcase than
// a throwaway mock. Shared by the fresh-install seed (prisma/seed.ts) and the
// production migration that replaces the old mock project (prisma/replace-meeting.ts).

export const DEMO_PROJECT = {
  name: "Project Document Pipeline (Doc-Pipe)",
  customer: "Internal — Friday Sharing",
  businessType: "Internal Tool",
  status: "Active",
  description:
    "A document-graph pipeline that scaffolds SDLC documents per business type and traces change impact across dependencies — the app documenting itself.",
  startDate: new Date("2026-06-15"),
  endDate: new Date("2026-09-30"),
};

export type SeedDoc = {
  key: DocType;
  title: string;
  status: "Draft" | "InReview" | "Approved" | "Outdated";
  content: string;
};

// target depends on source  (source --> target)
export type SeedEdge = [DocType, DocType];

export const docs: SeedDoc[] = [
  {
    key: "BUSINESS_REQUIREMENT",
    title: "Business Requirement — Project Document Pipeline",
    status: "Approved",
    content: `# Business Requirement — Project Document Pipeline

## Problem
Project documents (business requirements, SRS, API specs, test cases…) live
scattered across drives and chat. When one changes, nobody knows which downstream
documents are now stale, and every new project re-creates the same document set
from a blank page.

## Objective
Provide a single place to author, link, and track project documents — and to make
**change impact** visible: when a document changes, highlight every dependent
document that may need review.

## Business Goals
- Standardise the document set per **business type** (auto-scaffold on new project)
- Make change impact visible through a **document dependency graph**
- Keep everything reviewable with roles, versioning, and an audit log
- Run cheaply on a single small server, with **no external AI at runtime**

## Stakeholders
| Role | Interest |
| --- | --- |
| BA / Editor | Author and link documents |
| Reviewer | Approve documents, catch stale ones |
| Project Lead | See project status & document coverage |
| Admin | Manage users, the Document Library, and edit locks |

## Out of Scope
- Real-time AI generation of document content
- An external customer-facing portal`,
  },
  {
    key: "FUNCTIONAL_REQUIREMENT",
    title: "Functional Requirement",
    status: "Approved",
    content: `# Functional Requirement

- **FR-1** Create a project with customer, business type, status, and start/end dates.
- **FR-2** On project creation, scaffold the document set defined by its business type.
- **FR-3** Author content in a Notion-style block editor — headings, tables, checklists,
  code, **Mermaid diagrams**, and rich formatting (colour, highlight, underline, alignment).
- **FR-4** Link documents as dependencies (source → target) to form a graph.
- **FR-5** When a document is marked changed, flag its downstream documents as impacted.
- **FR-6** Track document status: Draft → In Review → Approved → Outdated.
- **FR-7** Keep a version history per document.
- **FR-8** Enforce a **single-editor lock** per document (others see a "being edited" modal).
- **FR-9** Attach files (images / PDF / Office / zip, ≤10 MB) and embed images inline.
- **FR-10** Maintain a **Document Library** of reusable starter documents.
- **FR-11** Enforce roles — Admin / Editor / Reviewer / Viewer — on the server.
- **FR-12** Global search across projects and documents, plus an activity audit log.`,
  },
  {
    key: "SRS",
    title: "Software Requirements Specification",
    status: "Approved",
    content: `# Software Requirements Specification

## 1. Introduction
Doc-Pipe is a self-hosted web app for authoring and tracing SDLC project documents
as a dependency graph. This SRS specifies its requirements.

## 2. Functional Requirements
Derived from **FR-1 … FR-12**.

## 3. Non-Functional Requirements
- **Performance:** document and graph views load < 1s for ~50 documents.
- **Concurrency:** 10–50 internal users; same-document editing serialised by a lock.
- **Availability:** best-effort during business hours on a single-node deployment.
- **Security:** authenticated access via Cloudflare Access; roles enforced server-side.
- **Portability:** a single SQLite file in WAL mode — no external database service.

## 4. Constraints
- No AI inference at runtime (content is authored by people).
- One writable SQLite file; the app scales vertically, not horizontally.`,
  },
  {
    key: "FLOW_DIAGRAM",
    title: "Architecture & Document Lifecycle",
    status: "InReview",
    content: `# Architecture & Document Lifecycle

## System Architecture
\`\`\`mermaid
flowchart LR
  U[User] --> CF[Cloudflare Access + Tunnel]
  CF --> N[Next.js App Router]
  N --> P[(SQLite • WAL)]
  N --> V[Volume: attachments]
\`\`\`

## Document Lifecycle
\`\`\`mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> InReview: submit
  InReview --> Approved: approve
  InReview --> Draft: request changes
  Approved --> Outdated: upstream changed
  Outdated --> InReview: revise
\`\`\`

The lifecycle drives FR-5 (impact) and FR-6 (status).`,
  },
  {
    key: "USER_STORY",
    title: "User Stories",
    status: "Approved",
    content: `# User Stories

## US-1 Scaffold a project
**As a** BA, **I want** documents auto-created for my project's business type,
**so that** I start from a consistent set instead of a blank page.

## US-2 Trace impact
**As a** reviewer, **I want** to see which documents depend on the one that changed,
**so that** I know exactly what to re-check.

## US-3 Safe concurrent editing
**As an** editor, **I want** to be told when someone else is editing a document,
**so that** we never overwrite each other's work.

## US-4 Reusable content
**As an** admin, **I want** a library of starter documents,
**so that** teams reuse proven templates.`,
  },
  {
    key: "DATABASE_DESIGN",
    title: "Database Design",
    status: "Approved",
    content: `# Database Design

SQLite (WAL) via Prisma. Core tables:

- **User**(id, email, name, role)
- **Project**(id, name, customer, businessType, status, startDate, endDate)
- **Document**(id, projectId → Project, type, title, status, content, version, editingBy…)
- **DocumentDependency**(id, projectId, sourceId → Document, targetId → Document)
- **DocumentVersion**(id, documentId → Document, version, content, note, authorId)
- **Attachment**(id, documentId → Document, filename, mime, size, path)
- **Comment**(id, documentId → Document, authorId, body)
- **Activity**(id, projectId, userId, action, detail, createdAt)

## Notes
- \`Document.content\` stores **HTML** for rich formatting; legacy rows may be Markdown.
- Edit lock lives on \`Document.editingById / editingByName / editingAt\` (stale after 90s).
- Every foreign key is indexed for graph traversal and query performance.`,
  },
  {
    key: "API_SPEC",
    title: "API Specification",
    status: "InReview",
    content: `# API Specification

Most mutations are **Next.js Server Actions**; the HTTP routes below back attachments.

## POST /api/documents/:docId/attachments
Upload a file (multipart \`file\`); validates MIME type and size (≤10 MB).
→ \`200 { id }\`, \`400\`, \`401\`, \`413\`

## GET /api/attachments/:id
Stream a stored attachment (inline for images and PDF).
→ \`200 <binary>\`, \`404\`

## Server Actions (selected)
- \`saveDocument\` — save content, bump version, clear the edit lock
- \`acquireEditLock\` / \`heartbeatEditLock\` / \`releaseEditLock\` — pessimistic lock
- \`createTemplate\` / \`updateTemplate\` / \`deleteTemplate\` — Document Library`,
  },
  {
    key: "TEST_CASE",
    title: "Test Cases",
    status: "Draft",
    content: `# Test Cases

| ID | Scenario | Expected |
| --- | --- | --- |
| TC-1 | Create a project of a business type | Document set scaffolded |
| TC-2 | Mark a document changed | Downstream documents flagged as impacted |
| TC-3 | Two users edit the same document | Second user sees a "being edited" modal |
| TC-4 | Save colour / underline / alignment | Formatting persists after reload |
| TC-5 | Resize an inline image, then save | Image keeps its chosen size |
| TC-6 | Upload a file larger than 10 MB | Rejected with 413 |
| TC-7 | Viewer attempts to edit | Blocked server-side |`,
  },
  {
    key: "UAT",
    title: "UAT Plan",
    status: "Draft",
    content: `# UAT Plan

Business sign-off scenarios mapped to FRs and user stories.

- [ ] UAT-1 A new project scaffolds the correct documents (FR-2)
- [ ] UAT-2 Impact highlighting matches the dependency graph (FR-5)
- [ ] UAT-3 The edit lock prevents concurrent overwrite (FR-8)
- [ ] UAT-4 Rich formatting survives a save (FR-3)
- [ ] UAT-5 Roles restrict actions correctly (FR-11)`,
  },
  {
    key: "DEPLOYMENT_CHECKLIST",
    title: "Deployment Checklist",
    status: "Draft",
    content: `# Deployment Checklist

- [ ] Build the Docker image (multi-stage, \`npm ci\`)
- [ ] Mount a persistent volume for the SQLite database + attachments
- [ ] Set \`DATABASE_URL\`, \`ADMIN_EMAILS\`, \`SEED_ON_EMPTY\`
- [ ] Run \`prisma db push\` on boot; seed once only if the database is empty
- [ ] Enable SQLite WAL mode + \`busy_timeout\`
- [ ] Put the app behind Cloudflare Tunnel + Access (no public port)
- [ ] Smoke test: log in, create a project, edit and save a document
- [ ] Confirm the seed marker so future redeploys never wipe data`,
  },
  {
    key: "RELEASE_NOTE",
    title: "Release Note — Doc-Pipe",
    status: "Draft",
    content: `# Release Note — Doc-Pipe

## Highlights
- Business-type document scaffolding + dependency graph with **impact highlighting**
- Notion-style block editor (BlockNote) — colour, alignment, Mermaid, tables, code
- Content stored as **HTML** so rich formatting persists across saves
- Pessimistic per-document **edit lock** with stale-lock auto-release
- Attachments (browse / paste / drag), Document Library, roles, and an audit log
- SQLite (WAL) + indexed foreign keys; Cloudflare Tunnel + Access

## Known Limitations
- Single writable node (vertical scale only)
- No runtime AI content generation`,
  },
];

export const edges: SeedEdge[] = [
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

/**
 * Create the demo project, its documents (+ initial versions), and the
 * dependency edges. Assumes the caller has already ensured `editorId` and
 * `memberUserIds` refer to existing users.
 */
export async function seedDemoProject(
  prisma: PrismaClient,
  editorId: string,
  memberUserIds: string[]
) {
  const project = await prisma.project.create({
    data: {
      ...DEMO_PROJECT,
      members: { create: memberUserIds.map((userId) => ({ userId })) },
    },
  });

  const idByType: Partial<Record<DocType, string>> = {};
  for (const d of docs) {
    const created = await prisma.document.create({
      data: {
        projectId: project.id,
        type: d.key,
        title: d.title,
        status: d.status,
        content: d.content,
        version: "v1.0",
        updatedById: editorId,
      },
    });
    idByType[d.key] = created.id;
    await prisma.documentVersion.create({
      data: {
        documentId: created.id,
        version: "v1.0",
        content: d.content,
        note: "Initial version",
        authorId: editorId,
      },
    });
  }

  for (const [from, to] of edges) {
    await prisma.documentDependency.create({
      data: {
        projectId: project.id,
        sourceId: idByType[from]!,
        targetId: idByType[to]!,
      },
    });
  }

  await prisma.activity.create({
    data: {
      projectId: project.id,
      userId: editorId,
      action: "seeded",
      detail: "Doc-Pipe demo project created",
    },
  });

  return project;
}
