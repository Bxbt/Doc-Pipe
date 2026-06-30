import { PrismaClient } from "@prisma/client";
import type { DocType } from "../src/lib/constants";

const prisma = new PrismaClient();

type SeedDoc = {
  key: DocType;
  title: string;
  status: "Draft" | "InReview" | "Approved" | "Outdated";
  content: string;
};

// target depends on source  (source --> target)
type SeedEdge = [DocType, DocType];

const docs: SeedDoc[] = [
  {
    key: "BUSINESS_REQUIREMENT",
    title: "Business Requirement — Meeting Room Booking",
    status: "Approved",
    content: `# Business Requirement

## Objective
Provide employees with a self-service system to **book meeting rooms** and avoid
double-booking, replacing the current shared spreadsheet.

## Business Goals
- Reduce booking conflicts to near zero
- Give facility managers visibility into room utilization
- Cut time spent coordinating rooms by 80%

## Stakeholders
| Role | Interest |
| --- | --- |
| Employees | Book rooms quickly |
| Facility Manager | Manage rooms & view usage |
| IT | Maintain the system |

## Scope
- Room catalog, availability calendar, booking & cancellation
- Email confirmation
- Basic utilization report

## Out of Scope
- Paid/external room rental
- Hardware (door locks, displays)`,
  },
  {
    key: "FUNCTIONAL_REQUIREMENT",
    title: "Functional Requirement",
    status: "Approved",
    content: `# Functional Requirement

- **FR-1** User can view a list of meeting rooms with capacity and facilities.
- **FR-2** User can view room availability on a calendar.
- **FR-3** User can create a booking for an available time slot.
- **FR-4** System prevents overlapping bookings for the same room.
- **FR-5** User can cancel their own booking.
- **FR-6** System sends an email confirmation on booking and cancellation.
- **FR-7** Facility Manager can add/edit/remove rooms.
- **FR-8** Facility Manager can view a utilization report.`,
  },
  {
    key: "SRS",
    title: "Software Requirements Specification",
    status: "Approved",
    content: `# SRS

## 1. Introduction
This SRS details the requirements for the Meeting Room Booking System.

## 2. Functional Requirements
Derived from FR-1 … FR-8.

## 3. Non-Functional Requirements
- **Performance:** availability calendar loads < 1s for 50 rooms.
- **Availability:** 99.5% during business hours.
- **Security:** authenticated access only; users edit only their own bookings.
- **Usability:** booking completable in < 3 clicks.

## 4. Constraints
- Single office timezone (Asia/Bangkok).
- Email via company SMTP.`,
  },
  {
    key: "FLOW_DIAGRAM",
    title: "Booking Flow Diagram",
    status: "InReview",
    content: `# Booking Flow

\`\`\`mermaid
flowchart TD
  A[User selects room] --> B[Pick time slot]
  B --> C{Slot available?}
  C -- No --> D[Show conflict]
  C -- Yes --> E[Confirm booking]
  E --> F[Save booking]
  F --> G[Send confirmation email]
\`\`\`

The flow covers the happy path (FR-3) and the conflict path (FR-4).`,
  },
  {
    key: "USER_STORY",
    title: "User Stories",
    status: "Approved",
    content: `# User Stories

## US-1 Book a room
**As an** employee
**I want** to book an available meeting room for a time slot
**So that** I have a guaranteed space for my meeting.

**Acceptance Criteria**
- Given an available slot, when I confirm, then the booking is saved.
- Given an occupied slot, when I try to book, then I see a conflict message.

## US-2 Cancel a booking
**As an** employee
**I want** to cancel my booking
**So that** the room is freed for others.

## US-3 Manage rooms
**As a** facility manager
**I want** to add and edit rooms
**So that** the catalog stays accurate.`,
  },
  {
    key: "DATABASE_DESIGN",
    title: "Database Design",
    status: "Approved",
    content: `# Database Design

## Tables
**room**(id, name, capacity, facilities, active)
**booking**(id, room_id, user_email, start_at, end_at, status, created_at)

## Constraints
- Unique guard against overlapping (room_id, time range) where status = 'booked'.
- Indexes on (room_id, start_at).`,
  },
  {
    key: "API_SPEC",
    title: "API Specification",
    status: "InReview",
    content: `# API Specification

## GET /api/rooms
List rooms. → \`200 [{ id, name, capacity }]\`

## GET /api/rooms/:id/availability?date=YYYY-MM-DD
Slots for a day. → \`200 [{ start, end, available }]\`

## POST /api/bookings
Create a booking.
Request: \`{ roomId, start, end }\`
Responses: \`201 { id }\`, \`409 Conflict\`, \`401 Unauthorized\`

## DELETE /api/bookings/:id
Cancel own booking. → \`204\`, \`403\`, \`404\``,
  },
  {
    key: "TEST_CASE",
    title: "Test Cases",
    status: "Draft",
    content: `# Test Cases

| ID | Scenario | Expected |
| --- | --- | --- |
| TC-1 | Book an available slot | 201, booking visible |
| TC-2 | Book an occupied slot | 409 conflict |
| TC-3 | Cancel own booking | 204, slot freed |
| TC-4 | Cancel someone else's booking | 403 |
| TC-5 | Booking confirmation email | email received |`,
  },
  {
    key: "UAT",
    title: "UAT Plan",
    status: "Draft",
    content: `# UAT Plan

Business sign-off scenarios mapped to BR & US.

- [ ] UAT-1 Employee books a room end-to-end (US-1)
- [ ] UAT-2 Conflict is prevented (FR-4)
- [ ] UAT-3 Employee cancels booking (US-2)
- [ ] UAT-4 Manager edits room catalog (US-3)
- [ ] UAT-5 Utilization report is accurate (FR-8)`,
  },
  {
    key: "DEPLOYMENT_CHECKLIST",
    title: "Deployment Checklist",
    status: "Draft",
    content: `# Deployment Checklist

- [ ] Run database migrations
- [ ] Configure SMTP credentials
- [ ] Set timezone to Asia/Bangkok
- [ ] Smoke test booking + cancellation
- [ ] Verify confirmation email delivery
- [ ] Enable backups`,
  },
  {
    key: "RELEASE_NOTE",
    title: "Release Note v1.0",
    status: "Draft",
    content: `# Release Note — v1.0

## Highlights
- Meeting room catalog & availability calendar
- Book and cancel rooms with conflict prevention
- Email confirmations
- Utilization report for facility managers

## Known Limitations
- Single timezone
- No recurring bookings (planned for v1.1)`,
  },
];

const edges: SeedEdge[] = [
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

async function main() {
  console.log("Resetting data…");
  await prisma.activity.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.documentVersion.deleteMany();
  await prisma.documentDependency.deleteMany();
  await prisma.document.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  console.log("Seeding users…");
  const users = await Promise.all(
    [
      { email: "owner@example.com", name: "Owner", role: "Admin" },
      { email: "admin@example.com", name: "Admin", role: "Admin" },
      { email: "ba@example.com", name: "Bee (BA / Editor)", role: "Editor" },
      { email: "reviewer@example.com", name: "Rin (Reviewer)", role: "Reviewer" },
      { email: "viewer@example.com", name: "View (Viewer)", role: "Viewer" },
    ].map((u) => prisma.user.create({ data: u }))
  );
  const editor = users.find((u) => u.role === "Editor")!;

  console.log("Seeding demo project…");
  const project = await prisma.project.create({
    data: {
      name: "Meeting Room Booking System",
      customer: "Internal — Facilities Team",
      businessType: "Internal Tool",
      status: "Active",
      description:
        "Self-service meeting room booking to eliminate double-booking and give managers usage visibility.",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-08-15"),
      members: { create: users.map((u) => ({ userId: u.id })) },
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
        updatedById: editor.id,
      },
    });
    idByType[d.key] = created.id;
    await prisma.documentVersion.create({
      data: { documentId: created.id, version: "v1.0", content: d.content, note: "Initial version", authorId: editor.id },
    });
  }

  console.log("Linking dependencies…");
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
    data: { projectId: project.id, userId: editor.id, action: "seeded", detail: "Demo project created" },
  });

  console.log("Done ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
