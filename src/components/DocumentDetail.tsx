"use client";

import { useState, useTransition, useEffect } from "react";
import dynamic from "next/dynamic";
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
  Lock,
} from "lucide-react";
import { AttachmentPanel } from "./AttachmentPanel";
import { CommentsProvider } from "./CommentsContext";
import { CommentPanel } from "./CommentPanel";
import { CommentableDocument } from "./CommentableDocument";
import { VersionHistory } from "./VersionHistory";
import type { CommentThreadFull, VersionLite } from "@/lib/queries";
import { Select } from "./inputs";
import { useScrollLock } from "./useScrollLock";
import { StatusBadge } from "./badges";
import { docShort, LOCK_HEARTBEAT_MS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  markChanged,
  resolveOutdated,
  saveDocument,
  setStatus,
  addDependency,
  removeDependency,
  acquireEditLock,
  heartbeatEditLock,
  releaseEditLock,
  forceReleaseEditLock,
} from "@/lib/actions";
import { Plus } from "lucide-react";

// BlockNote is client-only (touches window/document) — load without SSR.
const BlockEditor = dynamic(
  () => import("./BlockEditor").then((m) => m.BlockEditor),
  { ssr: false, loading: () => <p className="text-sm text-muted">Loading editor…</p> }
);

type RelDoc = { id: string; type: string; typeLabel: string; status: string };
type PickDoc = { id: string; type: string; typeLabel: string; title: string };

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
  threads,
  versions,
  currentUser,
  lock,
  perms,
}: {
  projectId: string;
  doc: Doc;
  upstream: RelDoc[];
  downstream: RelDoc[];
  allDocs: PickDoc[];
  attachments: { id: string; filename: string; mime: string; size: number }[];
  threads: CommentThreadFull[];
  versions: VersionLite[];
  currentUser: { id: string; name: string };
  lock: { active: boolean; byName: string | null; mine: boolean };
  perms: { canEdit: boolean; canReview: boolean; canAdmin: boolean };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(doc.content);
  // Initial content the editor mounts with. Normally the live doc; a restore
  // seeds it with an old version instead. `editorKey` forces BlockEditor to
  // remount so it re-parses the new seed (it only reads initialMarkdown once).
  const [editorSeed, setEditorSeed] = useState(doc.content);
  const [editorKey, setEditorKey] = useState(0);
  // Save opens a modal to choose the save kind (normal vs minor edit).
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  // Preview tables at the Word export's compact size (off by default, so the
  // on-screen tables read full-size).
  const [compactTables, setCompactTables] = useState(false);
  // Set when someone else holds the lock and we tried to edit.
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  useScrollLock(!!lockedBy || saveModalOpen);

  // Locked by another user (from the server's initial render).
  const lockedByOther = lock.active && !lock.mine;

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  // Request the lock; only enter edit mode if we got it.
  function onEdit() {
    startTransition(async () => {
      const res = await acquireEditLock(doc.id);
      if (res.ok) {
        setEditorSeed(doc.content);
        setEditorKey((k) => k + 1);
        setDraft(doc.content);
        setEditing(true);
      } else {
        setLockedBy(res.lockedBy);
      }
    });
  }

  // Restore-into-editor: acquire the lock, then open the editor seeded with an
  // old version's content. The user reviews and saves normally, so it flows
  // through the usual version bump + downstream ripple — no silent overwrite.
  function restoreInto(content: string) {
    startTransition(async () => {
      const res = await acquireEditLock(doc.id);
      if (res.ok) {
        setEditorSeed(content);
        setEditorKey((k) => k + 1);
        setDraft(content);
        setEditing(true);
      } else {
        setLockedBy(res.lockedBy);
      }
    });
  }

  function onCancel() {
    // The heartbeat effect's cleanup releases the lock when editing flips off.
    setEditing(false);
    setSaveModalOpen(false);
  }

  // Admin: force-clear another user's lock, then take it over.
  function onForceUnlock() {
    startTransition(async () => {
      await forceReleaseEditLock(projectId, doc.id);
      const res = await acquireEditLock(doc.id);
      if (res.ok) {
        setLockedBy(null);
        setDraft(doc.content);
        setEditing(true);
        router.refresh();
      }
    });
  }

  // Keep the lock alive while editing; release it on cancel/leave/unmount.
  useEffect(() => {
    if (!editing) return;
    const iv = setInterval(async () => {
      const res = await heartbeatEditLock(doc.id);
      if (!res.ok) {
        // Lost the lock (it went stale and was taken over).
        setEditing(false);
        setLockedBy("another user");
      }
    }, LOCK_HEARTBEAT_MS);
    return () => {
      clearInterval(iv);
      void releaseEditLock(doc.id);
    };
  }, [editing, doc.id]);

  function onSave(minor: boolean) {
    startTransition(async () => {
      await saveDocument(projectId, doc.id, draft, { minor });
      setSaveModalOpen(false);
      setEditing(false);
      router.refresh();
    });
  }

  function onCopy() {
    navigator.clipboard.writeText(doc.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Content is HTML for documents saved with the current editor, Markdown for
  // older ones — export with the matching type/extension so the file is honest.
  const isHtml = /^\s*</.test(doc.content);
  function onExport() {
    const ext = isHtml ? "html" : "md";
    const blob = new Blob([doc.content], {
      type: isHtml ? "text/html" : "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docShort(doc.type)}-${doc.title}.${ext}`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* edit-lock modal */}
      {lockedBy && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setLockedBy(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center gap-2 text-amber-300">
              <Lock size={18} />
              <h2 className="text-sm font-semibold">Document is being edited</h2>
            </div>
            <p className="text-sm text-muted">
              <span className="font-medium text-fg">{lockedBy}</span> is currently editing this
              document. You can’t edit it until they finish or the lock expires.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              {perms.canAdmin && (
                <button
                  onClick={onForceUnlock}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <Lock size={13} /> Force unlock (Admin)
                </button>
              )}
              <button
                onClick={() => setLockedBy(null)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* save-choice modal */}
      {saveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSaveModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center gap-2">
              <Save size={18} className="text-brand" />
              <h2 className="text-sm font-semibold">Save changes</h2>
            </div>
            <p className="text-sm text-muted">
              A normal save bumps the version and, if this document is Approved, flags every
              downstream document as Outdated. Choose <span className="font-medium text-fg">Minor
              edit</span> for a typo or formatting fix that shouldn’t affect anything downstream.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => onSave(false)}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
              >
                <Save size={14} /> Save
              </button>
              <button
                onClick={() => onSave(true)}
                disabled={isPending}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
              >
                <Pencil size={14} /> Minor edit
              </button>
              <button
                onClick={() => setSaveModalOpen(false)}
                disabled={isPending}
                className="mt-1 rounded-lg px-3 py-1.5 text-sm text-muted hover:text-fg disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
            onClick={onEdit}
            disabled={isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50",
              lockedByOther
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                : "border-border bg-surface hover:bg-surface-2"
            )}
            title={lockedByOther ? `${lock.byName} is editing this document` : undefined}
          >
            {lockedByOther ? <Lock size={14} /> : <Pencil size={14} />}
            {lockedByOther ? `Locked by ${lock.byName}` : "Edit"}
          </button>
        )}
        {editing && (
          <>
            <button
              onClick={() => setSaveModalOpen(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
            >
              <Save size={14} /> Save
            </button>
            <button
              onClick={onCancel}
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
          <Download size={14} /> Export .{isHtml ? "html" : "md"}
        </button>
        <VersionHistory
          projectId={projectId}
          docId={doc.id}
          versions={versions}
          onRestore={perms.canEdit && !editing ? restoreInto : undefined}
        />

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

      <CommentsProvider
        projectId={projectId}
        docId={doc.id}
        threads={threads}
        currentUser={currentUser}
        canAdmin={perms.canAdmin}
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
          {/* content */}
          <div className={`rounded-xl border border-border bg-surface p-6${compactTables ? " tables-compact" : ""}`}>
            {/* Table size toggle: preview how tables shrink in the Word export. */}
            <div className="mb-3 flex items-center justify-end gap-2 text-xs text-muted">
              <span>Table size</span>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                <button
                  onClick={() => setCompactTables(false)}
                  className={`rounded-md px-2 py-0.5 ${!compactTables ? "bg-brand text-brand-fg" : "hover:bg-surface-2"}`}
                >
                  Normal
                </button>
                <button
                  onClick={() => setCompactTables(true)}
                  className={`rounded-md px-2 py-0.5 ${compactTables ? "bg-brand text-brand-fg" : "hover:bg-surface-2"}`}
                >
                  Export size
                </button>
              </div>
            </div>
            {editing ? (
              <BlockEditor key={editorKey} docId={doc.id} initialMarkdown={editorSeed} onChange={setDraft} />
            ) : (
              <CommentableDocument content={doc.content} />
            )}
          </div>

          {/* related docs + comments */}
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
            <CommentPanel />
            <AttachmentPanel docId={doc.id} attachments={attachments} canEdit={perms.canEdit} />
          </div>
        </div>
      </CommentsProvider>
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
        <div className="mb-2">
          <Select
            value=""
            disabled={isPending}
            placeholder="Select a document…"
            onChange={(v) => v && link(v)}
            options={options.map((d) => ({ value: d.id, label: `${d.typeLabel} — ${d.title}` }))}
            className="text-xs"
          />
        </div>
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
                {d.typeLabel}
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
