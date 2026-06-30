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
        title="Document Library"
        subtitle="Reusable document definitions and starting content. Edit, add, or copy — these power the pickers in Business Types."
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
