import { prisma } from "./db";

// Turn a name/title into a readable, URL-friendly base. Unicode letters and
// numbers are kept (so a Thai name stays Thai in the address bar), while
// whitespace and punctuation collapse to single hyphens.
export function slugify(name: string): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_/\\]+/g, "-")
    // Keep letters, numbers, and combining marks (\p{M} — Thai vowel/tone marks
    // sit on their base letter and must survive), drop everything else.
    .replace(/[^\p{L}\p{N}\p{M}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Route segments a project id must not shadow (e.g. /projects/new).
const RESERVED_PROJECT_IDS = new Set(["new"]);

// Pick the first free id: `base`, then `base-2`, `base-3`, … avoiding anything
// already taken.
function firstFree(base: string, taken: Set<string>): string {
  if (base && !taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// A readable, unique id for a new project derived from its name. Existing rows
// keep whatever id they already have — only new projects get slug ids.
export async function newProjectId(name: string): Promise<string> {
  let base = slugify(name) || "project";
  if (RESERVED_PROJECT_IDS.has(base)) base = `${base}-project`;
  const rows = await prisma.project.findMany({
    where: { id: { startsWith: base } },
    select: { id: true },
  });
  return firstFree(base, new Set(rows.map((r) => r.id)));
}

// A readable, unique id for a new document derived from its title. `alsoTaken`
// lets a batch (e.g. scaffolding) reserve ids it just generated but hasn't
// committed yet.
export async function newDocumentId(title: string, alsoTaken?: Set<string>): Promise<string> {
  const base = slugify(title) || "document";
  const rows = await prisma.document.findMany({
    where: { id: { startsWith: base } },
    select: { id: true },
  });
  const taken = new Set(rows.map((r) => r.id));
  if (alsoTaken) for (const id of alsoTaken) taken.add(id);
  return firstFree(base, taken);
}
