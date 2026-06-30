import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const isNewClient = !globalForPrisma.prisma;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// SQLite tuning for concurrent use (10–50 users editing at once):
//  - WAL lets many readers run alongside one writer (persisted in the DB file).
//  - busy_timeout makes a writer wait briefly for a lock instead of erroring
//    with SQLITE_BUSY.
// Run once per fresh client; fire-and-forget is fine (WAL persists in the file).
if (isNewClient) {
  prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => {});
  prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => {});
}
