"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap, ExternalLink, X } from "lucide-react";
import { DOC_TYPE_MAP, docShort, docLabel } from "@/lib/constants";
import { downstreamOf, type Edge } from "@/lib/graph";
import { markChanged } from "@/lib/actions";

export type GraphNode = {
  id: string;
  type: string;
  status: string;
  outdated: boolean;
};

const COL_W = 168;
const ROW_H = 70;
const NODE_W = 132;
const NODE_H = 48;
const PAD_X = 40;
const PAD_Y = 36;

const STATUS_FILL: Record<string, string> = {
  Approved: "rgb(16 185 129)",
  InReview: "rgb(245 158 11)",
  Draft: "rgb(113 113 122)",
  Outdated: "rgb(239 68 68)",
};

export function DependencyGraph({
  projectId,
  nodes,
  edges,
}: {
  projectId: string;
  nodes: GraphNode[];
  edges: Edge[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  const layout = useMemo(() => {
    // Map present stages to compact column indices.
    const stages = Array.from(
      new Set(nodes.map((n) => DOC_TYPE_MAP[n.type]?.stage ?? 0))
    ).sort((a, b) => a - b);
    const colOf = new Map(stages.map((s, i) => [s, i]));

    const byCol = new Map<number, GraphNode[]>();
    for (const n of nodes) {
      const col = colOf.get(DOC_TYPE_MAP[n.type]?.stage ?? 0) ?? 0;
      if (!byCol.has(col)) byCol.set(col, []);
      byCol.get(col)!.push(n);
    }

    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    for (const [col, list] of byCol) {
      maxRows = Math.max(maxRows, list.length);
      list.forEach((n, i) => {
        pos.set(n.id, { x: PAD_X + col * COL_W, y: PAD_Y + i * ROW_H });
      });
    }
    const width = PAD_X * 2 + (stages.length - 1) * COL_W + NODE_W;
    const height = PAD_Y * 2 + Math.max(0, maxRows - 1) * ROW_H + NODE_H;
    return { pos, width, height };
  }, [nodes]);

  const impacted = useMemo(
    () => (selected ? downstreamOf(selected, edges) : new Set<string>()),
    [selected, edges]
  );

  const selectedNode = nodes.find((n) => n.id === selected) ?? null;

  function onMark() {
    if (!selected) return;
    startTransition(async () => {
      const res = await markChanged(projectId, selected);
      setFlash(`${res.impacted} document(s) marked outdated`);
      router.refresh();
      setTimeout(() => setFlash(null), 4000);
    });
  }

  function edgeActive(e: Edge): boolean {
    if (!selected) return false;
    return (e.sourceId === selected || impacted.has(e.sourceId)) && impacted.has(e.targetId);
  }

  function nodeState(id: string): "selected" | "impacted" | "dim" | "normal" {
    if (!selected) return "normal";
    if (id === selected) return "selected";
    if (impacted.has(id)) return "impacted";
    return "dim";
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Click a document to preview its <span className="text-fg">impact</span> — everything
          downstream lights up.
        </p>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <Legend color="rgb(16 185 129)" label="Approved" />
          <Legend color="rgb(245 158 11)" label="In Review" />
          <Legend color="rgb(113 113 122)" label="Draft" />
          <Legend color="rgb(239 68 68)" label="Outdated" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="min-w-full"
        >
          {/* edges */}
          {edges.map((e, i) => {
            const a = layout.pos.get(e.sourceId);
            const b = layout.pos.get(e.targetId);
            if (!a || !b) return null;
            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;
            const mx = (x1 + x2) / 2;
            const active = edgeActive(e);
            return (
              <path
                key={i}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={active ? "rgb(239 68 68)" : "rgb(var(--border))"}
                strokeWidth={active ? 2.2 : 1.4}
                opacity={selected && !active ? 0.25 : 1}
              />
            );
          })}

          {/* nodes */}
          {nodes.map((n) => {
            const p = layout.pos.get(n.id);
            if (!p) return null;
            const state = nodeState(n.id);
            const fill = STATUS_FILL[n.outdated ? "Outdated" : n.status] ?? STATUS_FILL.Draft;
            const opacity = state === "dim" ? 0.3 : 1;
            const stroke =
              state === "selected"
                ? "rgb(129 140 248)"
                : state === "impacted"
                ? "rgb(239 68 68)"
                : "rgb(var(--border))";
            return (
              <g
                key={n.id}
                transform={`translate(${p.x}, ${p.y})`}
                opacity={opacity}
                onClick={() => setSelected(n.id === selected ? null : n.id)}
                className="cursor-pointer"
              >
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={10}
                  fill="rgb(var(--surface-2))"
                  stroke={stroke}
                  strokeWidth={state === "selected" || state === "impacted" ? 2 : 1.2}
                />
                <circle cx={16} cy={NODE_H / 2} r={5} fill={fill} />
                <text x={30} y={NODE_H / 2 - 3} fontSize={11} fontWeight={600} fill="rgb(var(--fg))">
                  {docShort(n.type)}
                </text>
                <text x={30} y={NODE_H / 2 + 11} fontSize={9} fill="rgb(var(--muted))">
                  {n.outdated ? "outdated" : n.status.toLowerCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* impact panel */}
      {selectedNode && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex-1">
            <div className="text-sm font-medium">{docLabel(selectedNode.type)}</div>
            <div className="text-xs text-muted">
              Changing this impacts{" "}
              <span className="font-semibold text-red-400">{impacted.size}</span> downstream
              document(s).
            </div>
            {flash && <div className="mt-1 text-xs font-medium text-red-400">⚡ {flash}</div>}
          </div>
          <Link
            href={`/projects/${projectId}/documents/${selectedNode.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm hover:text-brand"
          >
            <ExternalLink size={14} /> Open
          </Link>
          <button
            onClick={onMark}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            <Zap size={14} /> {isPending ? "Applying…" : "Mark as changed"}
          </button>
          <button
            onClick={() => setSelected(null)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:text-fg"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
