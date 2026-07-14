"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ChevronUp,
  ChevronDown,
  FileText,
  AlertTriangle,
  Check,
  Minus,
  Plus,
  Trash2,
  Wand2,
  X,
  MessageSquare,
} from "lucide-react";
import { DependencyGraph, type GraphNode } from "./DependencyGraph";
import { StatusBadge } from "./badges";
import { ProgressBar } from "./ui";
import { Select, DatePicker } from "./inputs";
import { useScrollLock } from "./useScrollLock";
import { docLabel, docShort, DOC_TYPES, DOC_STATUSES } from "@/lib/constants";
import { timeAgo, cn } from "@/lib/utils";
import type { Edge } from "@/lib/graph";
import {
  addDocument,
  deleteDocument,
  scaffoldPipeline,
  updateProject,
  deleteProject,
  reorderDocument,
  setStatusMany,
} from "@/lib/actions";

// "InReview" -> "In Review" for display; other statuses are already readable.
const statusLabel = (s: string) => (s === "InReview" ? "In Review" : s);

type DocLite = {
  id: string;
  type: string;
  title: string;
  status: string;
  version: string;
  outdated: boolean;
  updatedAt: string;
  updatedByName: string | null;
};

type TraceRow = {
  reqId: string;
  reqTitle: string;
  reqType: string;
  cells: { type: string; label: string; status: string | null }[];
};

type Props = {
  projectId: string;
  project: {
    name: string;
    exportName: string;
    customer: string | null;
    businessType: string;
    description: string | null;
    status: string;
    startDate: string;
    endDate: string;
    revisionHistory: string; // JSON string of RevisionRow[]
  };
  perms: { canEdit: boolean; canAdmin: boolean };
  businessTypeNames: string[];
  // Standard types + Document Library entries (same list the Business Types
  // page uses), so a new library document is addable to any project.
  docTypeOptions: { type: string; label: string }[];
  documents: DocLite[];
  // Unresolved comment-thread count per document id (for the card badge).
  unresolvedByDoc: Record<string, number>;
  nodes: GraphNode[];
  edges: Edge[];
  health: { label: string; total: number; done: number; pct: number }[];
  completion: number;
  missing: { label: string; type?: string; present: boolean; trackable: boolean }[];
  traceability: { columns: string[]; rows: TraceRow[] };
};

const TABS = ["Pipeline", "Dependency Graph", "Traceability", "Health", "Checklist", "Settings"] as const;

export function ProjectWorkspace(props: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Pipeline");

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm transition-colors",
              tab === t
                ? "border-brand font-medium text-fg"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Pipeline" && <Pipeline {...props} />}
      {tab === "Dependency Graph" && (
        <DependencyGraph
          projectId={props.projectId}
          nodes={props.nodes}
          edges={props.edges}
          canEdit={props.perms.canEdit}
        />
      )}
      {tab === "Traceability" && <Traceability {...props} />}
      {tab === "Health" && <Health {...props} />}
      {tab === "Checklist" && <Checklist {...props} />}
      {tab === "Settings" && <Settings {...props} />}
    </div>
  );
}

function AddDocBar({
  projectId,
  perms,
  docTypeOptions,
}: {
  projectId: string;
  perms: Props["perms"];
  docTypeOptions: Props["docTypeOptions"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>(docTypeOptions[0]?.type ?? DOC_TYPES[0].type);
  const [isPending, startTransition] = useTransition();
  useScrollLock(open);
  if (!perms.canEdit) return null;

  function confirmAdd() {
    startTransition(async () => {
      // Pass the label as the title so custom library types get a
      // human name instead of their SLUG_TYPE key.
      const label = docTypeOptions.find((d) => d.type === type)?.label;
      await addDocument(projectId, type, label);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
      >
        <Plus size={14} /> Add document
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold">Add document</h2>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:text-fg"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5 p-5">
              <span className="text-xs font-medium text-muted">Document type</span>
              <Select
                value={type}
                onChange={setType}
                options={docTypeOptions.map((d) => ({ value: d.type, label: d.label }))}
                className="w-full"
              />
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Starter content comes from the matching Document Library entry.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={confirmAdd}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
              >
                <Plus size={14} /> {isPending ? "Adding…" : "Add document"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ScaffoldButton({ projectId, full }: { projectId: string; full?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await scaffoldPipeline(projectId);
          router.refresh();
        })
      }
      disabled={isPending}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-50",
        full ? "bg-brand text-brand-fg hover:opacity-90" : "border border-border bg-surface hover:bg-surface-2"
      )}
    >
      <Wand2 size={15} /> {isPending ? "Generating…" : "Generate standard pipeline"}
    </button>
  );
}

function Pipeline({ projectId, documents, unresolvedByDoc, perms, docTypeOptions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Friendly label for a document type. Standard types use their built-in name;
  // custom Document Library types (which may be Thai) use their library name so
  // the pipeline never falls back to a raw SLUG_TYPE key.
  const typeLabel = (t: string) => docTypeOptions.find((o) => o.type === t)?.label ?? docLabel(t);
  const isStandard = (t: string) => DOC_TYPES.some((d) => d.type === t);
  const shortFor = (t: string) =>
    isStandard(t) ? docShort(t) : typeLabel(t).trim().slice(0, 3);
  // Multi-select: pick several documents and change their status in one action.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<string>("InReview");

  function toggle(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function applyBulk() {
    const ids = [...selected];
    if (ids.length === 0) return;
    startTransition(async () => {
      await setStatusMany(projectId, ids, bulkStatus);
      setSelected(new Set());
      router.refresh();
    });
  }

  if (documents.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-dashed border-border py-14 text-center">
        <p className="text-sm font-medium">This project has no documents yet.</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
          Generate the full standard pipeline (BR → SRS → User Story → API → Test → UAT → Release)
          with dependencies in one click, or add documents one at a time.
        </p>
        {perms.canEdit ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            <ScaffoldButton projectId={projectId} full />
            <div className="text-[11px] text-muted">or</div>
            <AddDocBar projectId={projectId} perms={perms} docTypeOptions={docTypeOptions} />
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted">Ask an Editor to add documents.</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {perms.canEdit && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <AddDocBar projectId={projectId} perms={perms} docTypeOptions={docTypeOptions} />
          <ScaffoldButton projectId={projectId} />
        </div>
      )}
      {perms.canEdit && selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <span className="text-xs text-muted">Set status</span>
          <Select
            value={bulkStatus}
            onChange={setBulkStatus}
            options={DOC_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
            className="w-36"
          />
          <button
            onClick={applyBulk}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            <Check size={14} /> Apply
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            <X size={14} /> Clear
          </button>
        </div>
      )}
      {documents.map((d, i) => (
        <div key={d.id}>
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-surface p-4 transition-colors hover:border-brand/50",
              d.outdated ? "border-red-500/40" : "border-border",
              selected.has(d.id) && "border-brand ring-1 ring-brand/40"
            )}
          >
            {perms.canEdit && (
              <input
                type="checkbox"
                title="Select for bulk status change"
                checked={selected.has(d.id)}
                onChange={(e) => toggle(d.id, e.target.checked)}
                className="h-4 w-4 shrink-0 accent-brand"
              />
            )}
            <Link
              href={`/projects/${projectId}/documents/${d.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-semibold text-muted">
                {shortFor(d.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.title}</div>
                <div className="truncate text-[11px] text-muted">
                  {typeLabel(d.type)} · {d.version} · updated {timeAgo(d.updatedAt)}
                </div>
              </div>
            </Link>
            {d.outdated && (
              <span className="hidden items-center gap-1 text-[11px] text-red-400 sm:inline-flex">
                <AlertTriangle size={13} /> needs update
              </span>
            )}
            {(unresolvedByDoc[d.id] ?? 0) > 0 && (
              <span
                title={`${unresolvedByDoc[d.id]} unresolved comment(s)`}
                className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[11px] font-medium text-brand"
              >
                <MessageSquare size={11} /> {unresolvedByDoc[d.id]}
              </span>
            )}
            <StatusBadge status={d.outdated ? "Outdated" : d.status} />
            {perms.canEdit && (
              <div className="flex flex-col">
                <button
                  title="Move up"
                  disabled={i === 0 || isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await reorderDocument(projectId, d.id, "up");
                      router.refresh();
                    })
                  }
                  className="flex h-4 w-6 items-center justify-center rounded text-muted hover:text-fg disabled:opacity-30"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  title="Move down"
                  disabled={i === documents.length - 1 || isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await reorderDocument(projectId, d.id, "down");
                      router.refresh();
                    })
                  }
                  className="flex h-4 w-6 items-center justify-center rounded text-muted hover:text-fg disabled:opacity-30"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            )}
            {perms.canEdit && (
              <button
                title="Delete document"
                onClick={() => {
                  if (!confirm(`Delete "${d.title}"? This also removes its links.`)) return;
                  startTransition(async () => {
                    await deleteDocument(projectId, d.id);
                    router.refresh();
                  });
                }}
                disabled={isPending}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          {i < documents.length - 1 && (
            <div className="flex justify-center py-1.5 text-muted">
              <ArrowDown size={16} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Traceability({ traceability }: Props) {
  const { columns, rows } = traceability;
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted">
        Add a Business or Functional Requirement to build the traceability matrix.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-4 py-3 font-medium">Requirement</th>
            {columns.map((c) => (
              <th key={c} className="px-4 py-3 text-center font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reqId} className="border-b border-border last:border-0">
              <td className="px-4 py-3">
                <div className="text-sm font-medium">{docShort(r.reqType)}</div>
                <div className="text-[11px] text-muted">{r.reqTitle}</div>
              </td>
              {r.cells.map((cell) => (
                <td key={cell.type} className="px-4 py-3 text-center">
                  {cell.status ? (
                    <span className="inline-flex flex-col items-center gap-1">
                      <Check size={15} className="text-emerald-400" />
                      <StatusBadge status={cell.status} />
                    </span>
                  ) : (
                    <Minus size={15} className="mx-auto text-muted/50" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
        ✓ = a downstream document of that type is traceable from the requirement through the
        dependency graph.
      </p>
    </div>
  );
}

function Health({ health, completion }: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <div className="text-xs font-medium text-muted">Overall Completion</div>
        <div className="my-2 text-4xl font-semibold tabular-nums">{completion}%</div>
        <ProgressBar value={completion} />
        <div className="mt-2 text-[11px] text-muted">based on approved documents</div>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6 lg:col-span-2">
        <div className="mb-4 text-sm font-semibold">Readiness by Phase</div>
        <div className="flex flex-col gap-4">
          {health.map((h) => (
            <div key={h.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">{h.label}</span>
                <span className="tabular-nums text-muted">
                  {h.done}/{h.total} · {h.pct}%
                </span>
              </div>
              <ProgressBar value={h.pct} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Checklist({ missing }: Props) {
  const presentCount = missing.filter((m) => m.present).length;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 text-sm text-muted">
        Recommended documents for this project type — {presentCount}/{missing.length} present.
      </div>
      <div className="flex flex-col gap-2">
        {missing.map((m, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full",
                m.present ? "bg-emerald-500/15 text-emerald-400" : "bg-surface-2 text-muted"
              )}
            >
              {m.present ? <Check size={14} /> : <FileText size={13} />}
            </span>
            <span className={cn("flex-1 text-sm", !m.present && "text-muted")}>{m.label}</span>
            {!m.trackable ? (
              <span className="text-[11px] text-muted">manual</span>
            ) : m.present ? (
              <span className="text-[11px] text-emerald-400">present</span>
            ) : (
              <span className="text-[11px] text-amber-400">missing</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type RevisionRow = { editor: string; date: string; detail: string; version: string; approver: string };

const EMPTY_REVISION: RevisionRow = { editor: "", date: "", detail: "", version: "", approver: "" };

function parseRevisions(json: string): RevisionRow[] {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.map((r) => ({ ...EMPTY_REVISION, ...r }));
  } catch {
    return [];
  }
}

function Settings({ projectId, project, perms, businessTypeNames }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: project.name,
    exportName: project.exportName ?? "",
    customer: project.customer ?? "",
    businessType: project.businessType,
    description: project.description ?? "",
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
  });
  const [rows, setRows] = useState<RevisionRow[]>(() => parseRevisions(project.revisionHistory));
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const setRow = (i: number, patch: Partial<RevisionRow>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { ...EMPTY_REVISION }]);
  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const moveRow = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  if (!perms.canEdit) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        Your role cannot edit project settings.
      </div>
    );
  }

  function save() {
    startTransition(async () => {
      await updateProject(projectId, { ...form, revisionHistory: JSON.stringify(rows) });
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Project settings</h2>
        <L label="Name">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </L>
        <L label="Customer">
          <input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} className={inputCls} />
        </L>
        <L label="Export file name">
          <input
            value={form.exportName}
            onChange={(e) => setForm({ ...form, exportName: e.target.value })}
            placeholder={project.name}
            className={inputCls}
          />
          <span className="text-xs text-muted">
            Base name for exported files: {(form.exportName.trim() || project.name)}_YYMMDD.docx. Empty uses the project name.
          </span>
        </L>
        <div className="grid grid-cols-2 gap-4">
          <L label="Business type">
            <Select
              value={form.businessType}
              onChange={(v) => setForm({ ...form, businessType: v })}
              options={Array.from(new Set([form.businessType, ...businessTypeNames]))
                .filter(Boolean)
                .map((t) => ({ value: t, label: t }))}
            />
          </L>
          <L label="Status">
            <Select
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              options={["Active", "OnHold", "Done", "Archived"].map((s) => ({ value: s, label: s }))}
            />
          </L>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <L label="Start date">
            <DatePicker value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
          </L>
          <L label="End date">
            <DatePicker value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} />
          </L>
        </div>
        <L label="Description">
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(inputCls, "resize-y")} />
        </L>

        {/* Revision history — manually entered; renders as the fixed-format table
            at the front of the Word (BOI) export. */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">ประวัติการแก้ไขเอกสาร</span>
            <span className="text-xs text-muted">Word export front table</span>
          </div>
          {rows.length === 0 && (
            <p className="text-xs text-muted">ยังไม่มีรายการ — กด “เพิ่มแถว” เพื่อกรอกประวัติการแก้ไข</p>
          )}
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">ลำดับ {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0}
                    className="rounded px-1.5 text-muted hover:text-fg disabled:opacity-30" title="เลื่อนขึ้น">↑</button>
                  <button type="button" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1}
                    className="rounded px-1.5 text-muted hover:text-fg disabled:opacity-30" title="เลื่อนลง">↓</button>
                  <button type="button" onClick={() => removeRow(i)}
                    className="rounded px-1 text-muted hover:text-red-400" title="ลบแถว"><Trash2 size={14} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <L label="ชื่อผู้แก้ไข">
                  <input value={r.editor} onChange={(e) => setRow(i, { editor: e.target.value })} className={inputCls} />
                </L>
                <L label="วันที่">
                  <DatePicker value={r.date} onChange={(v) => setRow(i, { date: v })} />
                </L>
                <L label="เวอร์ชั่น">
                  <input value={r.version} onChange={(e) => setRow(i, { version: e.target.value })} className={inputCls} />
                </L>
                <L label="ผู้อนุมัติ">
                  <input value={r.approver} onChange={(e) => setRow(i, { approver: e.target.value })} className={inputCls} />
                </L>
              </div>
              <L label="รายละเอียด">
                <textarea rows={2} value={r.detail} onChange={(e) => setRow(i, { detail: e.target.value })} className={cn(inputCls, "resize-y")} />
              </L>
            </div>
          ))}
          <button type="button" onClick={addRow}
            className="w-full rounded-lg border border-dashed border-border py-2 text-sm text-muted hover:border-brand hover:text-brand">
            + เพิ่มแถว
          </button>
        </div>

        <button
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
        >
          {saved ? "Saved ✓" : isPending ? "Saving…" : "Save changes"}
        </button>
      </div>

      {perms.canAdmin && (
        <div className="space-y-3 rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <h2 className="text-sm font-semibold text-red-300">Danger zone</h2>
          <p className="text-xs text-muted">
            Deleting a project permanently removes all its documents, dependencies, and history.
          </p>
          <button
            onClick={() => {
              if (!confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
              startTransition(async () => {
                await deleteProject(projectId);
                router.push("/projects");
              });
            }}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-50"
          >
            <Trash2 size={15} /> Delete this project
          </button>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand";

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
