#!/bin/sh
set -e

echo "→ Applying database schema (prisma db push)…"
npx prisma db push --skip-generate

# Seed only when the database is empty AND SEED_ON_EMPTY=true.
# This never wipes existing data.
if [ "$SEED_ON_EMPTY" = "true" ]; then
  echo "→ Seeding demo data if database is empty…"
  npx tsx prisma/seed-if-empty.ts || echo "  (seed skipped)"
fi

echo "→ Starting Next.js on port 3000…"
exec node_modules/.bin/next start -p 3000
