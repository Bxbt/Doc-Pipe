// One-off, idempotent migration: remove the old mock "Meeting Room Booking
// System" demo project and replace it with the real Doc-Pipe demo project.
// Preserves all users and any other projects (e.g. hand-made test projects).
//
// Run inside the container:  npx tsx prisma/replace-meeting.ts
import { PrismaClient } from "@prisma/client";
import { DEMO_PROJECT, seedDemoProject } from "./demo-content";

const prisma = new PrismaClient();

const OLD_NAME = "Meeting Room Booking System";

async function ensureUsers() {
  let users = await prisma.user.findMany();
  if (users.length === 0) {
    console.log("  No users found — creating the standard demo users…");
    await Promise.all(
      [
        { email: "owner@example.com", name: "Owner", role: "Admin" },
        { email: "admin@example.com", name: "Admin", role: "Admin" },
        { email: "ba@example.com", name: "Bee (BA / Editor)", role: "Editor" },
        { email: "reviewer@example.com", name: "Rin (Reviewer)", role: "Reviewer" },
        { email: "viewer@example.com", name: "View (Viewer)", role: "Viewer" },
      ].map((u) => prisma.user.create({ data: u }))
    );
    users = await prisma.user.findMany();
  }
  return users;
}

async function main() {
  const users = await ensureUsers();
  const editor =
    users.find((u) => u.role === "Editor") ??
    users.find((u) => u.role === "Admin") ??
    users[0];

  // Remove the old mock project(s). Cascade clears its documents, versions,
  // dependencies, attachments, and members; the audit log survives (SetNull).
  const old = await prisma.project.findMany({ where: { name: OLD_NAME } });
  for (const p of old) {
    await prisma.project.delete({ where: { id: p.id } });
    console.log(`  Deleted old project "${p.name}" (${p.id}).`);
  }
  if (old.length === 0) console.log(`  No "${OLD_NAME}" project found — nothing to delete.`);

  // Idempotency: don't create a second Doc-Pipe project on a re-run.
  const existing = await prisma.project.findFirst({ where: { name: DEMO_PROJECT.name } });
  if (existing) {
    console.log(`  "${DEMO_PROJECT.name}" already exists (${existing.id}) — skipping create.`);
    return;
  }

  const project = await seedDemoProject(
    prisma,
    editor.id,
    users.map((u) => u.id)
  );
  console.log(`  Created "${project.name}" (${project.id}) with ${users.length} members.`);
}

main()
  .then(() => console.log("Done ✓"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
