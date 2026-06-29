// Runs the demo seed ONLY when the database has no projects yet.
// Safe to run on every boot — it never overwrites existing data.
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const prisma = new PrismaClient();

(async () => {
  const count = await prisma.project.count();
  await prisma.$disconnect();
  if (count > 0) {
    console.log(`  Database already has ${count} project(s) — skipping seed.`);
    return;
  }
  console.log("  Empty database — running demo seed…");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
})();
