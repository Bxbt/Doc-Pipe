// Built-in document templates. Users can copy a starter into a new document.

export type Template = { name: string; description: string; content: string };

export const TEMPLATES: Template[] = [
  {
    name: "Business Requirement",
    description: "Objective, goals, stakeholders, scope.",
    content: `# Business Requirement

## Objective
<What business problem are we solving?>

## Business Goals
-

## Stakeholders
| Role | Interest |
| --- | --- |
|  |  |

## Scope
-

## Out of Scope
- `,
  },
  {
    name: "Functional Requirement",
    description: "Numbered functional capabilities.",
    content: `# Functional Requirement

- **FR-1**
- **FR-2**
- **FR-3** `,
  },
  {
    name: "SRS",
    description: "Functional + non-functional requirements and constraints.",
    content: `# SRS

## 1. Introduction

## 2. Functional Requirements

## 3. Non-Functional Requirements
- Performance:
- Availability:
- Security:
- Usability:

## 4. Constraints`,
  },
  {
    name: "BOI SRS Template",
    description: "SRS variant aligned to BOI documentation.",
    content: `# Software Requirements Specification (BOI)

## 1. เอกสารอ้างอิง / References

## 2. ขอบเขตระบบ / System Scope

## 3. ความต้องการเชิงหน้าที่ / Functional Requirements

## 4. ความต้องการที่ไม่ใช่เชิงหน้าที่ / Non-Functional Requirements

## 5. การควบคุมการเข้าถึง / Access Control

## 6. การตรวจสอบและบันทึก / Audit & Logging`,
  },
  {
    name: "User Story",
    description: "As a / I want / So that, with acceptance criteria.",
    content: `# User Stories

## US-1 <title>
**As a** <role>
**I want** <capability>
**So that** <benefit>

**Acceptance Criteria**
- Given <context>, when <action>, then <outcome>.`,
  },
  {
    name: "API Documentation",
    description: "Endpoints with methods, request/response, status codes.",
    content: `# API Specification

## GET /api/resource
List resources.
Response: \`200 [{ id, name }]\`

## POST /api/resource
Create.
Request: \`{ name }\`
Responses: \`201 { id }\`, \`400\`, \`401\``,
  },
  {
    name: "Test Case",
    description: "Scenario / expected result table.",
    content: `# Test Cases

| ID | Scenario | Expected |
| --- | --- | --- |
| TC-1 |  |  |
| TC-2 |  |  |`,
  },
  {
    name: "UAT",
    description: "Business sign-off checklist.",
    content: `# UAT Plan

- [ ] UAT-1
- [ ] UAT-2
- [ ] UAT-3 `,
  },
  {
    name: "Deployment Checklist",
    description: "Pre/post deployment steps.",
    content: `# Deployment Checklist

- [ ] Run migrations
- [ ] Configure environment variables
- [ ] Smoke test critical paths
- [ ] Enable backups`,
  },
  {
    name: "Rollback Plan",
    description: "Steps to revert a failed release.",
    content: `# Rollback Plan

## Trigger
<When do we roll back?>

## Steps
1.
2.

## Verification
- `,
  },
  {
    name: "Release Note",
    description: "Highlights, fixes, known limitations.",
    content: `# Release Note — vX.Y

## Highlights
-

## Fixes
-

## Known Limitations
- `,
  },
];
