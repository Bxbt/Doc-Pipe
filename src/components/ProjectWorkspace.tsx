"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, FileText, AlertTriangle, Check, Minus } from "lucide-react";
import { DependencyGraph, type GraphNode } from "./DependencyGraph";
import { StatusBadge } from "./badges";
import { ProgressBar } from "./ui";
import { docLabel, docShort } from "@/lib/constants";
import { timeAgo, cn } from "@/lib/utils";
import type { Edge } from "@/lib/graph";

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
  documents: DocLite[];
  nodes: GraphNode[];
  edges: Edge[];
  health: { label: string; total: number; done: number; pct: number }[];
  completion: number;
  missing: { label: string; type?: string; present: boolean; trackable: boolean }[];
  traceability: { columns: string[]; rows: TraceRow[] };
  members: { name: string; email: string; role: string }[];
};

const TABS = ["Pipeline", "Dependency Graph", "Traceability", "Health", "Checklist"] as const;

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
        <DependencyGraph projectId={props.projectId} nodes={props.nodes} edges={props.edges} />
      )}
      {tab === "Traceability" && <Traceability {...props} />}
      {tab === "Health" && <Health {...props} />}
      {tab === "Checklist" && <Checklist {...props} />}
    </div>
  );
}

function Pipeline({ projectId, documents }: Props) {
  return (
    <div className="mx-auto max-w-2xl">
      {documents.map((d, i) => (
        <div key={d.id}>
          <Link
            href={`/projects/${projectId}/documents/${d.id}`}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-surface p-4 transition-colors hover:border-brand/50",
              d.outdated ? "border-red-500/40" : "border-border"
            )}
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
            {d.outdated && (
              <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                <AlertTriangle size={13} /> needs update
              </span>
            )}
            <StatusBadge status={d.outdated ? "Outdated" : d.status} />
          </Link>
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
