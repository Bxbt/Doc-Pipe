import { getTemplates } from "@/lib/templates-db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TemplatesManager } from "@/components/TemplatesManager";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [templates, user] = await Promise.all([getTemplates(), getCurrentUser()]);

  return (
    <div>
      <PageHeader
        title="Template Library"
        subtitle="Built-in starting points for every document type. Edit, add, or copy."
      />
      <TemplatesManager
        canEdit={canEdit(user)}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          content: t.content,
          builtin: t.builtin,
        }))}
      />
    </div>
  );
}
