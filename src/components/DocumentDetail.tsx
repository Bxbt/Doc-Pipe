"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Save,
  X,
  Copy,
  Download,
  Zap,
  Check,
  RotateCcw,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { AttachmentPanel } from "./AttachmentPanel";
import { StatusBadge } from "./badges";
import { docLabel, docShort } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  markChanged,
  resolveOutdated,
  saveDocument,
  setStatus,
  addDependency,
  removeDependency,
} from "@/lib/actions";
import { Plus } from "lucide-react";

type RelDoc = { id: string; type: string; status: string };
type PickDoc = { id: string; type: string; title: string };

type Doc = {
  id: string;
  type: string;
  typeLabel: string;
  title: string;
  status: string;
  version: string;
  outdated: boolean;
  content: string;
  updatedByName: string | null;
};

export function DocumentDetail({
  projectId,
  doc,
  upstream,
  downstream,
  allDocs,
  attachments,
  perms,
}: {
  projectId: string;
  doc: Doc;
  upstream: RelDoc[];
  downstream: RelDoc[];
  allDocs: PickDoc[];
  attachments: { id: string; filename: string; mime: string; size: number }[];
  perms: { canEdit: boolean; canReview: boolean };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.content);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function onSave() {
    startTransition(async () => {
      await saveDocument(projectId, doc.id, draft);
      setEditing(false);
      router.refresh();
    });
  }

  function onCopy() {
    navigator.clipboard.writeText(doc.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onExport() {
    const blob = new Blob([doc.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docShort(doc.type)}-${doc.title}.md`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted">{doc.typeLabel}</div>
          <h1 className="text-xl font-semibold">{doc.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
            <span>{doc.version}</span>
            {doc.updatedByName && <span>· last edit by {doc.updatedByName}</span>}
          </div>
        </div>
        <StatusBadge status={doc.outdated ? "Outdated" : doc.status} />
      </div>

      {doc.outdated && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          <AlertTriangle size={15} />
          An upstream document changed — this document may be out of date.
          {perms.canEdit && (
            <button
              onClick={() => run(() => resolveOutdated(projectId, doc.id))}
              disabled={isPending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 py-1 text-xs hover:bg-red-500/20"
            >
              <RotateCcw size={12} /> Mark reconciled
            </button>
          )}
        </div>
      )}

      {/* toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!editing && perms.canEdit && (
          <button
            onClick={() => {
              setDraft(doc.content);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <Pencil size={14} /> Edit
          </button>
        )}
        {editing && (
          <>
            <button
              onClick={onSave}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
            >
              <Save size={14} /> Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <X size={14} /> Cancel
            </button>
          </>
        )}
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
        >
          <Download size={14} /> Export .md
        </button>

        <div className="ml-auto flex items-center gap-2">
          {perms.canEdit && (
            <button
              onClick={() => run(() => markChanged(projectId, doc.id))}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
            >
              <Zap size={14} /> Mark changed
            </button>
          )}
          {perms.canEdit && doc.status !== "InReview" && (
            <button
              onClick={() => run(() => setStatus(projectId, doc.id, "InReview"))}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
            >
              Request review
            </button>
          )}
          {perms.canReview && doc.status !== "Approved" && (
            <button
              onClick={() => run(() => setStatus(projectId, doc.id, "Approved"))}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
            >
              <Check size={14} /> Approve
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
        {/* content */}
        <div className="rounded-xl border border-border bg-surface p-6">
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="min-h-[60vh] w-full resize-y bg-transparent font-mono text-sm outline-none"
            />
          ) : (
            <Markdown>{doc.content || "_No content yet._"}</Markdown>
          )}
        </div>

        {/* related docs */}
        <div className="flex flex-col gap-4">
          <RelatedPanel
            title="Depends on"
            icon={<ArrowUpRight size={13} />}
            projectId={projectId}
            docId={doc.id}
            direction="upstream"
            docs={upstream}
            allDocs={allDocs}
            canEdit={perms.canEdit}
            empty="No upstream documents"
          />
          <RelatedPanel
            title="Impacts"
            icon={<ArrowDownRight size={13} />}
            projectId={projectId}
            docId={doc.id}
            direction="downstream"
            docs={downstream}
            allDocs={allDocs}
            canEdit={perms.canEdit}
            empty="No downstream documents"
          />
          <AttachmentPanel docId={doc.id} attachments={attachments} canEdit={perms.canEdit} />
        </div>
      </div>
    </div>
  );
}

function RelatedPanel({
  title,
  icon,
  projectId,
  docId,
  direction,
  docs,
  allDocs,
  canEdit,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  projectId: string;
  docId: string;
  direction: "upstream" | "downstream";
  docs: RelDoc[];
  allDocs: PickDoc[];
  canEdit: boolean;
  empty: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Documents available to link (exclude ones already linked here).
  const linkedIds = new Set(docs.map((d) => d.id));
  const options = allDocs.filter((d) => !linkedIds.has(d.id));

  function link(otherId: string) {
    // upstream: the other doc is the source (this depends on it)
    // downstream: this doc is the source (it impacts the other)
    const sourceId = direction === "upstream" ? otherId : docId;
    const targetId = direction === "upstream" ? docId : otherId;
    setErr(null);
    startTransition(async () => {
      try {
        await addDependency(projectId, sourceId, targetId);
        setAdding(false);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to link");
      }
    });
  }

  function unlink(otherId: string) {
    const sourceId = direction === "upstream" ? otherId : docId;
    const targetId = direction === "upstream" ? docId : otherId;
    startTransition(async () => {
      await removeDependency(projectId, sourceId, targetId);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          {icon} {title}
        </div>
        {canEdit && options.length > 0 && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted hover:text-brand"
            title="Add link"
          >
            <Plus size={13} />
          </button>
        )}
      </div>

      {adding && (
        <select
          autoFocus
          defaultValue=""
          disabled={isPending}
          onChange={(e) => e.target.value && link(e.target.value)}
          className="mb-2 w-full rounded-lg border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-brand"
        >
          <option value="" disabled>
            Select a document…
          </option>
          {options.map((d) => (
            <option key={d.id} value={d.id}>
              {docLabel(d.type)} — {d.title}
            </option>
          ))}
        </select>
      )}
      {err && <p className="mb-2 text-[11px] text-red-400">{err}</p>}

      {docs.length === 0 ? (
        <p className="text-[11px] text-muted">{empty}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {docs.map((d) => (
            <div
              key={d.id}
              className={cn(
                "group flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs",
                d.status === "Outdated" ? "border-red-500/40" : "border-border"
              )}
            >
              <Link
                href={`/projects/${projectId}/documents/${d.id}`}
                className="truncate hover:text-brand"
              >
                {docLabel(d.type)}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusBadge status={d.status} />
                {canEdit && (
                  <button
                    onClick={() => unlink(d.id)}
                    disabled={isPending}
                    title="Remove link"
                    className="text-muted opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
