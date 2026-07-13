// Seeds the demo data EXACTLY ONCE per deployment volume, and NEVER overwrites
// existing data. Uses a marker file on the persistent data volume so the demo is
// not re-created on later redeploys — even if you delete every project.
// In prod set DATA_DIR=/data (same volume as uploads); dev falls back to ./data.
import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function dataDir(): string {
  return process.env.DATA_DIR ?? join(process.cwd(), "data");
}

const marker = join(dataDir(), ".seeded");

function writeMarker() {
  try {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(marker, new Date().toISOString());
    console.log("  Wrote seed marker.");
  } catch (e) {
    console.warn("  Could not write seed marker:", e);
  }
}

const prisma = new PrismaClient();

(async () => {
  if (existsSync(marker)) {
    console.log("  Seed marker present — skipping (already initialised).");
    await prisma.$disconnect();
    return;
  }

  // No marker yet. Only seed when the database is genuinely empty, so an
  // existing deployment's data is never wiped by the demo seed.
  const count = await prisma.project.count();
  await prisma.$disconnect();

  if (count > 0) {
    console.log(`  Found ${count} existing project(s) — NOT seeding; marking as initialised.`);
    writeMarker();
    return;
  }

  console.log("  Empty database — running demo seed (one time only)…");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
  writeMarker();
})();
