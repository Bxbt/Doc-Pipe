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
} from "lucide-react";
import { DependencyGraph, type GraphNode } from "./DependencyGraph";
import { StatusBadge } from "./badges";
import { ProgressBar } from "./ui";
import { Select, DatePicker } from "./inputs";
import { docLabel, docShort, DOC_TYPES } from "@/lib/constants";
import { timeAgo, cn } from "@/lib/utils";
import type { Edge } from "@/lib/graph";
import {
  addDocument,
  deleteDocument,
  scaffoldPipeline,
  updateProject,
  deleteProject,
  reorderDocument,
} from "@/lib/actions";

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
    customer: string | null;
    businessType: string;
    description: string | null;
    status: string;
    startDate: string;
    endDate: string;
  };
  perms: { canEdit: boolean; canAdmin: boolean };
  businessTypeNames: string[];
  documents: DocLite[];
  nodes: GraphNode[];
  edges: Edge[];
  health: { label: string; total: number; done: number; pct: number }[];
  completion: number;
  missing: { label: string; type?: string; present: boolean; trackable: boolean }[];
  traceability: { columns: string[]; rows: TraceRow[] };
  members: { name: string; email: string; role: string }[];
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

function AddDocBar({ projectId, perms }: { projectId: string; perms: Props["perms"] }) {
  const router = useRouter();
  const [type, setType] = useState<string>(DOC_TYPES[0].type);
  const [isPending, startTransition] = useTransition();
  if (!perms.canEdit) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={type}
        onChange={setType}
        options={DOC_TYPES.map((d) => ({ value: d.type, label: d.label }))}
        className="w-56"
      />
      <button
        onClick={() =>
          startTransition(async () => {
            await addDocument(projectId, type);
            router.refresh();
          })
        }
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50"
      >
        <Plus size={14} /> Add document
      </button>
    </div>
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

function Pipeline({ projectId, documents, perms }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
            <AddDocBar projectId={projectId} perms={perms} />
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
          <AddDocBar projectId={projectId} perms={perms} />
          <ScaffoldButton projectId={projectId} />
        </div>
      )}
      {documents.map((d, i) => (
        <div key={d.id}>
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-surface p-4 transition-colors hover:border-brand/50",
              d.outdated ? "border-red-500/40" : "border-border"
            )}
          >
            <Link
              href={`/projects/${projectId}/documents/${d.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-[11px] font-semibold text-muted">
                {docShort(d.type)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{docLabel(d.type)}</div>
                <div className="truncate text-[11px] text-muted">
                  {d.title} · {d.version} · updated {timeAgo(d.updatedAt)}
                </div>
              </div>
            </Link>
            {d.outdated && (
              <span className="hidden items-center gap-1 text-[11px] text-red-400 sm:inline-flex">
                <AlertTriangle size={13} /> needs update
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
                  if (!confirm(`Delete "${docLabel(d.type)}"? This also removes its links.`)) return;
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

function Settings({ projectId, project, perms, businessTypeNames }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: project.name,
    customer: project.customer ?? "",
    businessType: project.businessType,
    description: project.description ?? "",
    status: project.status,
    startDate: project.startDate,
    endDate: project.endDate,
  });
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  if (!perms.canEdit) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-muted">
        Your role cannot edit project settings.
      </div>
    );
  }

  function save() {
    startTransition(async () => {
      await updateProject(projectId, form);
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
