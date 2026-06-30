import { prisma } from "./db";
import {
  BUSINESS_TYPES,
  DOC_TYPES,
  SMART_CHECKLIST,
  STANDARD_PIPELINE_EDGES,
  type DocType,
} from "./constants";

export type BizType = {
  id: string;
  name: string;
  sort: number;
  docTypes: DocType[];
  edges: [DocType, DocType][];
};

const ALL_TYPES = DOC_TYPES.map((d) => d.type);
const ORDER = new Map(DOC_TYPES.map((d, i) => [d.type, i]));

// Keep only edges whose endpoints are both in the selected doc-type set.
function edgesFor(docTypes: DocType[]): [DocType, DocType][] {
  const set = new Set(docTypes);
  return STANDARD_PIPELINE_EDGES.filter(([a, b]) => set.has(a) && set.has(b));
}

// Default doc-type set for a built-in business type, derived from its checklist.
function defaultDocTypes(name: string): DocType[] {
  if (name === "Generic") return [...ALL_TYPES];
  const fromChecklist = (SMART_CHECKLIST[name] ?? [])
    .map((c) => c.type)
    .filter((t): t is DocType => Boolean(t));
  // Always ensure a Business Requirement anchors the pipeline.
  const set = new Set<DocType>(["BUSINESS_REQUIREMENT", ...fromChecklist]);
  return [...set].sort((a, b) => (ORDER.get(a) ?? 99) - (ORDER.get(b) ?? 99));
}

function parse(row: { id: string; name: string; sort: number; docTypes: string; edges: string }): BizType {
  let docTypes: DocType[] = [];
  let edges: [DocType, DocType][] = [];
  try {
    docTypes = JSON.parse(row.docTypes);
  } catch {}
  try {
    edges = JSON.parse(row.edges);
  } catch {}
  return { id: row.id, name: row.name, sort: row.sort, docTypes, edges };
}

// Returns all business types, seeding built-in defaults on first use.
export async function getBusinessTypes(): Promise<BizType[]> {
  const count = await prisma.businessType.count();
  if (count === 0) {
    await prisma.businessType.createMany({
      data: BUSINESS_TYPES.map((name, i) => {
        const docTypes = defaultDocTypes(name);
        return {
          name,
          sort: i,
          docTypes: JSON.stringify(docTypes),
          edges: JSON.stringify(edgesFor(docTypes)),
        };
      }),
    });
  }
  const rows = await prisma.businessType.findMany({
    orderBy: [{ sort: "asc" }, { name: "asc" }],
  });
  return rows.map(parse);
}

// The pipeline (doc types + edges) to scaffold for a given business-type name.
// Falls back to the full standard pipeline if the type is unknown.
export async function getBusinessTypePipeline(
  name: string
): Promise<{ docTypes: DocType[]; edges: [DocType, DocType][] }> {
  await getBusinessTypes(); // ensure seeded
  const row = await prisma.businessType.findUnique({ where: { name } });
  if (!row) return { docTypes: [...ALL_TYPES], edges: [...STANDARD_PIPELINE_EDGES] };
  const parsed = parse(row);
  if (parsed.docTypes.length === 0) {
    return { docTypes: [...ALL_TYPES], edges: [...STANDARD_PIPELINE_EDGES] };
  }
  return { docTypes: parsed.docTypes, edges: parsed.edges };
}
