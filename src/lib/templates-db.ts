import { prisma } from "./db";
import { TEMPLATES } from "./templates";

// Returns all templates, seeding the table from the built-in set on first use.
// Idempotent and safe to call on every page load.
export async function getTemplates() {
  const count = await prisma.template.count();
  if (count === 0) {
    await prisma.template.createMany({
      data: TEMPLATES.map((t, i) => ({
        name: t.name,
        description: t.description,
        content: t.content,
        builtin: true,
        sort: i,
      })),
    });
  }
  return prisma.template.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
}
