import { TEMPLATES } from "@/lib/templates";
import { PageHeader, Card } from "@/components/ui";
import { CopyButton } from "@/components/CopyButton";

export default function TemplatesPage() {
  return (
    <div>
      <PageHeader
        title="Template Library"
        subtitle="Built-in starting points for every document type. Copy and customize."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => (
          <Card key={t.name} className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-medium">{t.name}</h3>
              <p className="mt-0.5 text-xs text-muted">{t.description}</p>
            </div>
            <pre className="max-h-40 overflow-hidden rounded-lg border border-border bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
              {t.content.slice(0, 220)}
              {t.content.length > 220 ? "…" : ""}
            </pre>
            <div className="mt-auto">
              <CopyButton text={t.content} label="Copy template" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
