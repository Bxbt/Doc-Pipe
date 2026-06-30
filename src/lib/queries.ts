import { prisma } from "./db";
import { DOC_TYPES, SMART_CHECKLIST, isComplete, type DocType } from "./constants";
import type { Edge } from "./graph";

// Phase grouping used by the Project Health panel.
export const HEALTH_PHASES: { label: string; types: DocType[] }[] = [
  { label: "Requirement", types: ["BUSINESS_REQUIREMENT", "FUNCTIONAL_REQUIREMENT"] },
  { label: "Design", types: ["SRS", "FLOW_DIAGRAM", "USER_STORY", "DATABASE_DESIGN"] },
  { label: "API", types: ["API_SPEC"] },
  { label: "Testing", types: ["TEST_CASE", "UAT"] },
  { label: "Release", types: ["DEPLOYMENT_CHECKLIST", "RELEASE_NOTE"] },
];

export type DocLite = {
  id: string;
  type: string;
  title: string;
  status: string;
  version: string;
  outdated: boolean;
  updatedAt: Date;
};

export function computeHealth(docs: { type: string; status: string }[]) {
  return HEALTH_PHASES.map((phase) => {
    const inPhase = docs.filter((d) => phase.types.includes(d.type as DocType));
    const done = inPhase.filter((d) => isComplete(d.status)).length;
    const pct = inPhase.length ? Math.round((done / inPhase.length) * 100) : 0;
    return { label: phase.label, total: inPhase.length, done, pct };
  });
}

export function overallCompletion(docs: { status: string }[]): number {
  if (!docs.length) return 0;
  const done = docs.filter((d) => isComplete(d.status)).length;
  return Math.round((done / docs.length) * 100);
}

// Recommended-but-missing documents based on the project's business type.
export function missingDocs(businessType: string, docs: { type: string }[]) {
  const present = new Set(docs.map((d) => d.type));
  const checklist = SMART_CHECKLIST[businessType] ?? SMART_CHECKLIST.Generic;
  return checklist.map((item) => ({
    label: item.label,
    type: item.type,
    present: item.type ? present.has(item.type) : false,
    trackable: Boolean(item.type),
  }));
}

export async function getDashboardData() {
  const [projects, totalDocs, outdatedDocs, inReviewDocs, recentDocs, activities] =
    await Promise.all([
      prisma.project.findMany({
        include: { documents: { select: { type: true, status: true } } },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.document.count(),
      prisma.document.count({ where: { outdated: true } }),
      prisma.document.count({ where: { status: "InReview" } }),
      prisma.document.findMany({
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.activity.findMany({
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true } }, project: { select: { name: true } } },
      }),
    ]);

  const activeProjects = projects.filter((p) => p.status === "Active").length;

  // Count missing recommended docs across all projects.
  let missingCount = 0;
  for (const p of projects) {
    missingCount += missingDocs(p.businessType, p.documents).filter(
      (m) => m.trackable && !m.present
    ).length;
  }

  return {
    projects,
    activeProjects,
    totalDocs,
    outdatedDocs,
    inReviewDocs,
    missingCount,
    recentDocs,
    activities,
  };
}

export async function getProjectFull(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      documents: {
        include: { updatedBy: { select: { name: true } } },
      },
      dependencies: true,
      members: { include: { user: true } },
    },
  });
  if (!project) return null;

  // Order documents by their manual pipeline position, falling back to the
  // canonical stage order, then creation time.
  const stageOrder = new Map(DOC_TYPES.map((d, i) => [d.type, i]));
  project.documents.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    const sa = stageOrder.get(a.type as DocType) ?? 99;
    const sb = stageOrder.get(b.type as DocType) ?? 99;
    if (sa !== sb) return sa - sb;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const edges: Edge[] = project.dependencies.map((d) => ({
    sourceId: d.sourceId,
    targetId: d.targetId,
  }));

  return { project, edges };
}
