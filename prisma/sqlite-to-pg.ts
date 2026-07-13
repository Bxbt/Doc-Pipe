/**
 * One-shot data migration: SQLite (source) → Postgres (target).
 *
 *   SQLITE_URL=file:/abs/path/app.db \
 *   DATABASE_URL=postgres://... DIRECT_URL=postgres://... \
 *   npx tsx prisma/sqlite-to-pg.ts
 *
 * - Copies every row, PRESERVING ids (so FKs, MCP token hashes, and on-disk
 *   attachment references stay valid) and original createdAt.
 * - @updatedAt columns are auto-managed by Prisma on insert, so they are
 *   restored afterwards with raw UPDATEs (else "last activity" sort would reset).
 * - Idempotent: wipes the target (reverse FK order) before copying, so it can be
 *   re-run during dry-runs.
 *
 * Requires the source client generated from prisma/sqlite.prisma:
 *   npx prisma generate --schema prisma/sqlite.prisma
 */
import { PrismaClient as Pg } from "@prisma/client";
import { PrismaClient as Lite } from "../src/generated/sqlite-client";

const lite = new Lite();
const pg = new Pg();

// Insert order (parents first); wipe uses the reverse.
const ORDER = [
  "User",
  "Project",
  "Template",
  "BusinessType",
  "PersonalAccessToken",
  "ProjectMember",
  "Document",
  "Attachment",
  "DocumentDependency",
  "DocumentVersion",
  "CommentThread",
  "Comment",
  "Activity",
] as const;

// Models whose updatedAt is @updatedAt (needs restoring after insert).
const HAS_UPDATED_AT = new Set(["Project", "Document", "CommentThread", "Template", "BusinessType"]);

// model name -> the Prisma client delegate (same key on both clients).
const delegate = (client: any, name: string) => client[name[0].toLowerCase() + name.slice(1)];

async function restoreUpdatedAt(table: string, rows: { id: string; updatedAt: Date }[]) {
  for (const r of rows) {
    await pg.$executeRawUnsafe(`UPDATE "${table}" SET "updatedAt" = $1 WHERE id = $2`, r.updatedAt, r.id);
  }
}

async function main() {
  console.log("Reading source (SQLite)…");
  const data: Record<string, any[]> = {};
  for (const name of ORDER) data[name] = await delegate(lite, name).findMany();
  for (const name of ORDER) console.log(`  ${name.padEnd(20)} ${data[name].length}`);

  console.log("\nWiping target (Postgres) in reverse order…");
  for (const name of [...ORDER].reverse()) await delegate(pg, name).deleteMany({});

  console.log("\nCopying…");
  for (const name of ORDER) {
    const rows = data[name];
    if (rows.length) await delegate(pg, name).createMany({ data: rows });
    if (HAS_UPDATED_AT.has(name)) await restoreUpdatedAt(name, rows);
    console.log(`  ${name.padEnd(20)} ${rows.length} ✓`);
  }

  console.log("\nVerifying row counts…");
  let ok = true;
  for (const name of ORDER) {
    const src = data[name].length;
    const dst = await delegate(pg, name).count();
    const match = src === dst;
    if (!match) ok = false;
    console.log(`  ${match ? "✓" : "✗"} ${name.padEnd(20)} src=${src} dst=${dst}`);
  }
  console.log(ok ? "\nALL COUNTS MATCH ✓" : "\nMISMATCH ✗");
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await lite.$disconnect();
    await pg.$disconnect();
  });
