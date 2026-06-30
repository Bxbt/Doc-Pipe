import { getBusinessTypes } from "@/lib/business-types";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { DOC_TYPES } from "@/lib/constants";
import { PageHeader } from "@/components/ui";
import { BusinessTypesManager } from "@/components/BusinessTypesManager";

export const dynamic = "force-dynamic";

export default async function BusinessTypesPage() {
  const [types, user] = await Promise.all([getBusinessTypes(), getCurrentUser()]);

  return (
    <div>
      <PageHeader
        title="Business Types"
        subtitle="Each business type defines the pipeline (documents + dependencies) that 'Generate pipeline' creates for a project."
      />
      <BusinessTypesManager
        canEdit={canEdit(user)}
        docTypeOptions={DOC_TYPES.map((d) => ({ type: d.type, label: d.label }))}
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
