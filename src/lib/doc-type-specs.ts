import { docLabel } from "./constants";
import { slugType } from "./doc-types";

// Per-document-type authoring specs: the conditions and output format an AI
// client should follow when drafting a document of this type. Surfaced through
// the MCP layer so the user's own Claude/ChatGPT produces consistent documents.
//
// Keyed by DocType. Custom (library) types fall back to a generic spec.
export const DOC_TYPE_SPECS: Record<string, string> = {
  BUSINESS_REQUIREMENT:
    "Write in Markdown. Sections: ## Objective (the business problem), ## Business Goals (bullets), ## Stakeholders (table Role | Interest), ## Scope, ## Out of Scope. Be concrete and outcome-focused; avoid technical solutions.",
  FUNCTIONAL_REQUIREMENT:
    "Write in Markdown. A numbered list of capabilities as **FR-1**, **FR-2**, … Each is a single testable statement of what the system must do. Trace back to the Business Requirement where possible.",
  SRS:
    "Write in Markdown. Sections: ## 1. Introduction, ## 2. Functional Requirements (reference FR-n), ## 3. Non-Functional Requirements (Performance, Availability, Security, Usability), ## 4. Constraints. Precise and unambiguous.",
  FLOW_DIAGRAM:
    "Write in Markdown with ONE ```mermaid flowchart (flowchart TD or LR). Cover triggers, actors, decision points, and edge cases. Add a short prose description under the diagram.",
  USER_STORY:
    "Write in Markdown. One or more stories as ## US-n <title>, each with **As a** <role> / **I want** <capability> / **So that** <benefit>, followed by **Acceptance Criteria** in Given/When/Then bullets.",
  DATABASE_DESIGN:
    "Write in Markdown. Sections: ## Tables (each **Name**(col, col → FK…)), ## Constraints, ## Indexes. Note primary/foreign keys and important indexes for query paths.",
  API_SPEC:
    "Write in Markdown. One section per endpoint as ## METHOD /path with a one-line purpose, Request (JSON shape), and Responses (status codes with bodies). Keep it consistent with the Database Design and SRS.",
  TEST_CASE:
    "Write in Markdown as a table | ID | Scenario | Expected | with rows TC-1, TC-2, … Cover happy paths, edge cases, and error handling. Trace to the requirements being verified.",
  UAT:
    "Write in Markdown as a business sign-off checklist of `- [ ] UAT-n` items phrased from the end-user's perspective. Each maps to an acceptance criterion.",
  DEPLOYMENT_CHECKLIST:
    "Write in Markdown as `- [ ]` steps grouped pre/post deployment: migrations, environment variables, smoke tests, backups, rollback readiness.",
  RELEASE_NOTE:
    "Write in Markdown. Header # Release Note — vX.Y, then ## Highlights, ## Fixes, ## Known Limitations as bullet lists. User-facing and concise.",
};

const GENERIC_SPEC =
  "Write a clear, well-structured Markdown document appropriate for this document type. Use headings, bullet lists, and tables where helpful, and stay consistent with the upstream documents provided as context.";

// Resolve the authoring spec for a document type (standard or custom/library).
export function specForType(type: string): string {
  return DOC_TYPE_SPECS[type] ?? DOC_TYPE_SPECS[slugType(docLabel(type))] ?? GENERIC_SPEC;
}
