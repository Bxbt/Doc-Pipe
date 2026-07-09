"use client";

import { useEffect, useState } from "react";
import { History, X, AlignLeft, Columns2, Loader2 } from "lucide-react";
import { diffVersions } from "@/lib/actions";
import { useScrollLock } from "./useScrollLock";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { VersionLite } from "@/lib/queries";

// Version compare: pick an older and newer snapshot and see a word-level diff.
// One diff is computed (with <ins>/<del>); "Inline" shows it as tracked changes,
// "Side by side" renders the same HTML twice — CSS hides <ins> on the left
// column and <del> on the right — so both views cost a single diff.
export function VersionHistory({
  projectId,
  docId,
  versions,
}: {
  projectId: string;
  docId: string;
  versions: VersionLite[];
}) {
  const [open, setOpen] = useState(false);
  useScrollLock(open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={versions.length < 1}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
        title={versions.length < 2 ? "Need at least two versions to compare" : "Compare versions"}
      >
        <History size={14} /> History
      </button>
      {open && <CompareModal projectId={projectId} docId={docId} versions={versions} onClose={() => setOpen(false)} />}
    </>
  );
}

function CompareModal({
  docId,
  versions,
  onClose,
}: {
  projectId: string;
  docId: string;
  versions: VersionLite[];
  onClose: () => void;
}) {
  // Default: newest vs the one before it.
  const [newId, setNewId] = useState(versions[0]?.id ?? "");
  const [oldId, setOldId] = useState(versions[1]?.id ?? versions[0]?.id ?? "");
  const [view, setView] = useState<"inline" | "sbs">("inline");
  const [html, setHtml] = useState("");
  const [labels, setLabels] = useState<{ oldV: string; newV: string }>({ oldV: "", newV: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!oldId || !newId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    diffVersions(docId, oldId, newId)
      .then((r) => {
        if (cancelled) return;
        setHtml(r.html);
        setLabels({ oldV: r.oldVersion, newV: r.newVersion });
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to diff"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [docId, oldId, newId]);

  const opt = (v: VersionLite) =>
    `${v.version} · ${v.note ?? "—"} · ${formatDate(v.createdAt)}${v.authorName ? ` · ${v.authorName}` : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-surface shadow-2xl"
      >
        {/* Header: pickers + view toggle */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <History size={15} className="text-muted" />
          <span className="text-sm font-semibold">Compare versions</span>
          <div className="ml-2 flex flex-1 flex-wrap items-center gap-2">
            <select
              value={oldId}
              onChange={(e) => setOldId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-brand"
            >
              {versions.map((v) => <option key={v.id} value={v.id}>{opt(v)}</option>)}
            </select>
            <span className="text-xs text-muted">→</span>
            <select
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs outline-none focus:border-brand"
            >
              {versions.map((v) => <option key={v.id} value={v.id}>{opt(v)}</option>)}
            </select>
          </div>
          <div className="flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => setView("inline")}
              className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs", view === "inline" ? "bg-brand text-white" : "text-muted hover:bg-surface-2")}
            >
              <AlignLeft size={12} /> Inline
            </button>
            <button
              type="button"
              onClick={() => setView("sbs")}
              className={cn("inline-flex items-center gap-1 px-2 py-1 text-xs", view === "sbs" ? "bg-brand text-white" : "text-muted hover:bg-surface-2")}
            >
              <Columns2 size={12} /> Side by side
            </button>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 border-b border-border px-3 py-1.5 text-[11px] text-muted">
          <span><span className="rounded bg-emerald-500/20 px-1 text-emerald-300">added</span> in {labels.newV || "newer"}</span>
          <span><span className="rounded bg-red-500/20 px-1 text-red-300 line-through">removed</span> from {labels.oldV || "older"}</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" /> Computing diff…</div>
          ) : error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : oldId === newId ? (
            <p className="text-sm text-muted">Pick two different versions to compare.</p>
          ) : view === "inline" ? (
            <div className="prose-doc diff-inline" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-2 text-xs font-semibold text-muted">{labels.oldV || "Older"}</div>
                <div className="prose-doc diff-sbs-old" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
              <div className="border-l border-border pl-4">
                <div className="mb-2 text-xs font-semibold text-muted">{labels.newV || "Newer"}</div>
                <div className="prose-doc diff-sbs-new" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
