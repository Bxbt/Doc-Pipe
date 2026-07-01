"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Save } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { Card } from "./ui";
import { useScrollLock } from "./useScrollLock";
import { createTemplate, updateTemplate, deleteTemplate } from "@/lib/actions";

// Same block editor as documents — loaded without SSR (BlockNote is client-only).
const BlockEditor = dynamic(
  () => import("./BlockEditor").then((m) => m.BlockEditor),
  { ssr: false, loading: () => <p className="text-sm text-muted">Loading editor…</p> }
);

type T = {
  id: string;
  name: string;
  description: string;
  content: string;
  builtin: boolean;
};

type Draft = { id: string | null; name: string; description: string; content: string };

export function TemplatesManager({ templates, canEdit }: { templates: T[]; canEdit: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPending, startTransition] = useTransition();
  useScrollLock(!!draft);

  function save() {
    if (!draft) return;
    startTransition(async () => {
      if (draft.id) {
        await updateTemplate(draft.id, {
          name: draft.name,
          description: draft.description,
          content: draft.content,
        });
      } else {
        await createTemplate({
          name: draft.name,
          description: draft.description,
          content: draft.content,
        });
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this document?")) return;
    startTransition(async () => {
      await deleteTemplate(id);
      router.refresh();
    });
  }

  return (
    <div>
      {canEdit && (
        <div className="mb-4">
          <button
            onClick={() => setDraft({ id: null, name: "", description: "", content: "# New Document\n\n" })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            <Plus size={15} /> New document
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">{t.name}</h3>
                <p className="mt-0.5 text-xs text-muted">{t.description || "—"}</p>
              </div>
              {t.builtin && (
                <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                  built-in
                </span>
              )}
            </div>
            <pre className="max-h-32 overflow-hidden rounded-lg border border-border bg-surface-2 p-3 text-[11px] leading-relaxed text-muted">
              {t.content.slice(0, 200)}
              {t.content.length > 200 ? "…" : ""}
            </pre>
            <div className="mt-auto flex items-center gap-2">
              <CopyButton text={t.content} label="Copy" />
              {canEdit && (
                <>
                  <button
                    onClick={() =>
                      setDraft({ id: t.id, name: t.name, description: t.description, content: t.content })
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    disabled={isPending}
                    title="Delete document"
                    className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Editor modal */}
      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setDraft(null)}
        >
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">{draft.id ? "Edit document" : "New document"}</h2>
              <button
                onClick={() => setDraft(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>
            {/* No overflow clip here: the editor scrolls internally instead, so
                BlockNote's slash/+ menu (position:absolute) isn't clipped and can
                flip up near the bottom of the screen. */}
            <div className="flex min-h-0 flex-col gap-3 p-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Name</span>
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Description</span>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </label>
              <div className="flex min-h-0 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted">Content</span>
                <div className="bn-modal-editor rounded-lg border border-border bg-bg px-3 py-2">
                  <BlockEditor
                    initialMarkdown={draft.content}
                    onChange={(md) => setDraft((d) => (d ? { ...d, content: md } : d))}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                onClick={() => setDraft(null)}
                className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={isPending || !draft.name.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
              >
                <Save size={14} /> {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
