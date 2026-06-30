import { getBusinessTypes } from "@/lib/business-types";
import { getTemplates } from "@/lib/templates-db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { DOC_TYPES } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { BusinessTypesManager } from "@/components/BusinessTypesManager";

export const dynamic = "force-dynamic";

// Turn a free-text document name into a stable type key, e.g.
// "Security Review" -> "SECURITY_REVIEW".
function slugType(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export default async function BusinessTypesPage() {
  const [types, library, user] = await Promise.all([
    getBusinessTypes(),
    getTemplates(),
    getCurrentUser(),
  ]);

  // Picker = the 11 standard document types PLUS any extra Document Library
  // entries, so adding a document to the library makes it selectable here.
  // A library entry whose name matches a standard type collapses into it;
  // anything else becomes its own (custom) type keyed off its name.
  const byLabel = new Map(DOC_TYPES.map((d) => [d.label.toLowerCase(), d.type]));
  const options = new Map<string, string>(); // type -> label
  for (const d of DOC_TYPES) options.set(d.type, d.label);
  for (const t of library) {
    const type = byLabel.get(t.name.toLowerCase()) ?? slugType(t.name);
    if (type && !options.has(type)) options.set(type, t.name);
  }
  const docTypeOptions = [...options].map(([type, label]) => ({ type, label }));

  return (
    <div>
      <PageHeader
        title="Business Types"
        subtitle="Each business type defines the pipeline (documents + dependencies) that 'Generate pipeline' creates. The document choices come from the Document Library."
      />
      <BusinessTypesManager
        canEdit={canEdit(user)}
        docTypeOptions={docTypeOptions}
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          docTypes: t.docTypes,
          edges: t.edges,
        }))}
      />
    </div>
  );
}
