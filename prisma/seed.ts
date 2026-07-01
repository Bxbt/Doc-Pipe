import { PrismaClient } from "@prisma/client";
import { seedDemoProject } from "./demo-content";

const prisma = new PrismaClient();

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
  await seedDemoProject(
    prisma,
    editor.id,
    users.map((u) => u.id)
  );

  console.log("Done ✓");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
