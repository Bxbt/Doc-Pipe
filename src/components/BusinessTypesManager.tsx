"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, X, Save, ArrowRight } from "lucide-react";
import { Card } from "./ui";
import { Select } from "./inputs";
import { useScrollLock } from "./useScrollLock";
import { createBusinessType, updateBusinessType, deleteBusinessType } from "@/lib/actions";

type DocOption = { type: string; label: string };
type BT = { id: string; name: string; docTypes: string[]; edges: [string, string][] };
type Draft = { id: string | null; name: string; docTypes: string[]; edges: [string, string][] };

export function BusinessTypesManager({
  types,
  docTypeOptions,
  canEdit,
}: {
  types: BT[];
  docTypeOptions: DocOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isPending, startTransition] = useTransition();
  const labelOf = (t: string) => docTypeOptions.find((d) => d.type === t)?.label ?? t;

  function save() {
    if (!draft || !draft.name.trim()) return;
    // Drop edges whose endpoints are no longer selected.
    const set = new Set(draft.docTypes);
    const edges = draft.edges.filter(([a, b]) => set.has(a) && set.has(b));
    startTransition(async () => {
      if (draft.id) {
        await updateBusinessType(draft.id, { name: draft.name, docTypes: draft.docTypes, edges });
      } else {
        await createBusinessType({ name: draft.name, docTypes: draft.docTypes, edges });
      }
      setDraft(null);
      router.refresh();
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this business type?")) return;
    startTransition(async () => {
      await deleteBusinessType(id);
      router.refresh();
    });
  }

  return (
    <div>
      {canEdit && (
        <div className="mb-4">
          <button
            onClick={() => setDraft({ id: null, name: "", docTypes: [], edges: [] })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-fg hover:opacity-90"
          >
            <Plus size={15} /> New business type
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {types.map((t) => (
          <Card key={t.id} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t.name}</h3>
            <div className="flex flex-wrap gap-1">
              {t.docTypes.length === 0 && <span className="text-[11px] text-muted">No documents</span>}
              {t.docTypes.map((d) => (
                <span key={d} className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                  {labelOf(d)}
                </span>
              ))}
            </div>
            <div className="text-[11px] text-muted">
              {t.docTypes.length} documents · {t.edges.length} dependencies
            </div>
            {canEdit && (
              <div className="mt-auto flex items-center gap-2">
                <button
                  onClick={() => setDraft({ id: t.id, name: t.name, docTypes: [...t.docTypes], edges: [...t.edges] })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2"
                >
                  <Pencil size={13} /> Edit pipeline
                </button>
                <button
                  onClick={() => remove(t.id)}
                  disabled={isPending}
                  title="Delete"
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          docTypeOptions={docTypeOptions}
          onSave={save}
          isPending={isPending}
          labelOf={labelOf}
        />
      )}
    </div>
  );
}

function Editor({
  draft,
  setDraft,
  docTypeOptions,
  onSave,
  isPending,
  labelOf,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  docTypeOptions: DocOption[];
  onSave: () => void;
  isPending: boolean;
  labelOf: (t: string) => string;
}) {
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  useScrollLock(true); // this component only mounts while the modal is open



  function toggleDoc(type: string) {
    const has = draft.docTypes.includes(type);
    setDraft({
      ...draft,
      docTypes: has ? draft.docTypes.filter((t) => t !== type) : [...draft.docTypes, type],
    });
  }

  function addEdge() {
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo) return;
    if (draft.edges.some(([a, b]) => a === edgeFrom && b === edgeTo)) return;
    setDraft({ ...draft, edges: [...draft.edges, [edgeFrom, edgeTo]] });
    setEdgeFrom("");
    setEdgeTo("");
  }

  function removeEdge(i: number) {
    setDraft({ ...draft, edges: draft.edges.filter((_, idx) => idx !== i) });
  }

  const selected = docTypeOptions.filter((d) => draft.docTypes.includes(d.type));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && setDraft(null)}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{draft.id ? "Edit business type" : "New business type"}</h2>
          <button onClick={() => setDraft(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Name</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="e.g. Mobile App"
            />
          </label>

          <div>
            <div className="mb-2 text-xs font-medium text-muted">
              Documents in this pipeline ({draft.docTypes.length})
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {docTypeOptions.map((d) => {
                const on = draft.docTypes.includes(d.type);
                return (
                  <button
                    key={d.type}
                    onClick={() => toggleDoc(d.type)}
                    className={
                      "rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors " +
                      (on ? "border-brand/50 bg-brand/10 text-fg" : "border-border bg-surface-2 text-muted hover:text-fg")
                    }
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-muted">Dependencies ({draft.edges.length})</div>
            <div className="mb-2 flex flex-col gap-1.5">
              {draft.edges.length === 0 && <span className="text-[11px] text-muted">No dependencies yet.</span>}
              {draft.edges.map(([a, b], i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs">
                  <span>{labelOf(a)}</span>
                  <ArrowRight size={12} className="text-muted" />
                  <span>{labelOf(b)}</span>
                  <button onClick={() => removeEdge(i)} className="ml-auto text-muted hover:text-red-400">
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={edgeFrom}
                onChange={setEdgeFrom}
                placeholder="source…"
                options={selected.map((d) => ({ value: d.type, label: d.label }))}
                className="w-40 text-xs"
              />
              <ArrowRight size={12} className="text-muted" />
              <Select
                value={edgeTo}
                onChange={setEdgeTo}
                placeholder="depends…"
                options={selected.map((d) => ({ value: d.type, label: d.label }))}
                className="w-40 text-xs"
              />
              <button onClick={addEdge} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2">
                Add link
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">source → depends: the second document depends on the first.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={() => setDraft(null)} className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm hover:bg-surface-2">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isPending || !draft.name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} /> {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
