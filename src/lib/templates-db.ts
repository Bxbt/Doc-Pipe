import { prisma } from "./db";
import { TEMPLATES } from "./templates";

// Returns all templates, seeding the table from the built-in set on first use
// and topping up built-ins added later. Idempotent and safe on every page load.
export async function getTemplates() {
  const existing = await prisma.template.findMany({ select: { id: true, name: true } });

  if (existing.length === 0) {
    await prisma.template.createMany({
      data: TEMPLATES.map((t, i) => ({
        name: t.name,
        description: t.description,
        content: t.content,
        builtin: true,
        sort: i,
      })),
    });
  } else {
    const names = new Set(existing.map((t) => t.name));

    // One-time rename: the built-in API template used to be called
    // "API Documentation", which slugs to its own custom type instead of
    // collapsing into the standard API_SPEC. Keep the (possibly edited)
    // content, just fix the name.
    const legacy = existing.find((t) => t.name === "API Documentation");
    if (legacy && !names.has("API Specification")) {
      await prisma.template.update({
        where: { id: legacy.id },
        data: { name: "API Specification" },
      });
      names.delete("API Documentation");
      names.add("API Specification");
    }

    // Top up built-ins introduced after this database was first seeded
    // (e.g. Flow Diagram, Database Design), so every standard document
    // type has a Library starter.
    const missing = TEMPLATES.filter((t) => !names.has(t.name));
    if (missing.length > 0) {
      await prisma.template.createMany({
        data: missing.map((t) => ({
          name: t.name,
          description: t.description,
          content: t.content,
          builtin: true,
          sort: TEMPLATES.findIndex((x) => x.name === t.name),
        })),
      });
    }
  }

  return prisma.template.findMany({ orderBy: [{ sort: "asc" }, { createdAt: "asc" }] });
}
