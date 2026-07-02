import { DOC_TYPES } from "./constants";
import { getTemplates } from "./templates-db";

// Turn a free-text document name into a stable type key, e.g.
// "Security Review" -> "SECURITY_REVIEW".
export function slugType(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// The document-type picker = the 11 standard types PLUS any extra Document
// Library entries, so adding a document to the library makes it selectable
// everywhere (Business Types pipelines AND a project's "Add document" bar).
// A library entry whose name matches a standard type collapses into it;
// anything else becomes its own (custom) type keyed off its name.
export async function getDocTypeOptions(): Promise<{ type: string; label: string }[]> {
  const library = await getTemplates();
  const byLabel = new Map(DOC_TYPES.map((d) => [d.label.toLowerCase(), d.type]));
  const options = new Map<string, string>(); // type -> label
  for (const d of DOC_TYPES) options.set(d.type, d.label);
  for (const t of library) {
    const type = byLabel.get(t.name.toLowerCase()) ?? slugType(t.name);
    if (type && !options.has(type)) options.set(type, t.name);
  }
  return [...options].map(([type, label]) => ({ type, label }));
}
