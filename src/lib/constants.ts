// Central definitions for the document pipeline.
// SQLite stores these as strings; this file is the single source of truth.

export type DocType =
  | "BUSINESS_REQUIREMENT"
  | "FUNCTIONAL_REQUIREMENT"
  | "SRS"
  | "FLOW_DIAGRAM"
  | "USER_STORY"
  | "DATABASE_DESIGN"
  | "API_SPEC"
  | "TEST_CASE"
  | "UAT"
  | "DEPLOYMENT_CHECKLIST"
  | "RELEASE_NOTE";

export const DOC_TYPES: { type: DocType; label: string; short: string; stage: number }[] = [
  { type: "BUSINESS_REQUIREMENT", label: "Business Requirement", short: "BR", stage: 0 },
  { type: "FUNCTIONAL_REQUIREMENT", label: "Functional Requirement", short: "FR", stage: 1 },
  { type: "SRS", label: "SRS", short: "SRS", stage: 2 },
  { type: "FLOW_DIAGRAM", label: "Flow Diagram", short: "Flow", stage: 2 },
  { type: "USER_STORY", label: "User Story", short: "US", stage: 3 },
  { type: "DATABASE_DESIGN", label: "Database Design", short: "DB", stage: 3 },
  { type: "API_SPEC", label: "API Specification", short: "API", stage: 4 },
  { type: "TEST_CASE", label: "Test Case", short: "TC", stage: 5 },
  { type: "UAT", label: "UAT", short: "UAT", stage: 6 },
  { type: "DEPLOYMENT_CHECKLIST", label: "Deployment Checklist", short: "Deploy", stage: 7 },
  { type: "RELEASE_NOTE", label: "Release Note", short: "Release", stage: 8 },
];

export const DOC_TYPE_MAP: Record<string, { label: string; short: string; stage: number }> =
  Object.fromEntries(DOC_TYPES.map((d) => [d.type, d]));

export function docLabel(type: string): string {
  return DOC_TYPE_MAP[type]?.label ?? type;
}

export function docShort(type: string): string {
  return DOC_TYPE_MAP[type]?.short ?? type.slice(0, 3);
}

// ---- Document status ----
export type DocStatus = "Draft" | "InReview" | "Approved" | "Outdated";

export const DOC_STATUSES: DocStatus[] = ["Draft", "InReview", "Approved", "Outdated"];

export const STATUS_STYLE: Record<string, string> = {
  Draft: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  InReview: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Outdated: "bg-red-500/15 text-red-300 border-red-500/30",
};

// "Approved" counts as complete for project-health math.
export function isComplete(status: string): boolean {
  return status === "Approved";
}

// ---- Roles ----
export type Role = "Admin" | "Editor" | "Reviewer" | "Viewer";

export const ROLES: Role[] = ["Admin", "Editor", "Reviewer", "Viewer"];

export const ROLE_RANK: Record<Role, number> = {
  Viewer: 0,
  Reviewer: 1,
  Editor: 2,
  Admin: 3,
};

// ---- Smart Checklist: recommended docs per business type ----
export const BUSINESS_TYPES = [
  "Generic",
  "E-Commerce",
  "HR System",
  "Banking",
  "Internal Tool",
] as const;

// The canonical full pipeline (source --> target = target depends on source).
// Single source of truth used by scaffolding and business-type defaults.
export const STANDARD_PIPELINE_EDGES: [DocType, DocType][] = [
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

export const SMART_CHECKLIST: Record<string, { label: string; type?: DocType }[]> = {
  Generic: [
    { label: "Business Requirement", type: "BUSINESS_REQUIREMENT" },
    { label: "SRS", type: "SRS" },
    { label: "User Story", type: "USER_STORY" },
    { label: "API Specification", type: "API_SPEC" },
    { label: "Test Case", type: "TEST_CASE" },
    { label: "UAT", type: "UAT" },
    { label: "Release Note", type: "RELEASE_NOTE" },
  ],
  "E-Commerce": [
    { label: "Business Requirement", type: "BUSINESS_REQUIREMENT" },
    { label: "Payment Flow", type: "FLOW_DIAGRAM" },
    { label: "SRS", type: "SRS" },
    { label: "API Documentation", type: "API_SPEC" },
    { label: "Security Checklist" },
    { label: "Test Case", type: "TEST_CASE" },
    { label: "UAT", type: "UAT" },
    { label: "Release Note", type: "RELEASE_NOTE" },
  ],
  "HR System": [
    { label: "Business Requirement", type: "BUSINESS_REQUIREMENT" },
    { label: "Employee Workflow", type: "FLOW_DIAGRAM" },
    { label: "Approval Matrix" },
    { label: "Access Control" },
    { label: "SRS", type: "SRS" },
    { label: "User Manual" },
    { label: "UAT", type: "UAT" },
  ],
  Banking: [
    { label: "Business Requirement", type: "BUSINESS_REQUIREMENT" },
    { label: "Compliance Checklist" },
    { label: "Audit Log Design" },
    { label: "Encryption Requirement" },
    { label: "SRS", type: "SRS" },
    { label: "API Specification", type: "API_SPEC" },
    { label: "Test Case", type: "TEST_CASE" },
    { label: "UAT", type: "UAT" },
  ],
  "Internal Tool": [
    { label: "Business Requirement", type: "BUSINESS_REQUIREMENT" },
    { label: "SRS", type: "SRS" },
    { label: "User Story", type: "USER_STORY" },
    { label: "Deployment Checklist", type: "DEPLOYMENT_CHECKLIST" },
  ],
};
