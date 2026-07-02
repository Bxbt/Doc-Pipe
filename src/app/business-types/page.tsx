import { getBusinessTypes } from "@/lib/business-types";
import { getDocTypeOptions } from "@/lib/doc-types";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BusinessTypesManager } from "@/components/BusinessTypesManager";

export const dynamic = "force-dynamic";

export default async function BusinessTypesPage() {
  const [types, docTypeOptions, user] = await Promise.all([
    getBusinessTypes(),
    getDocTypeOptions(),
    getCurrentUser(),
  ]);

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
