"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

export type FeedActivity = {
  id: string;
  action: string;
  detail: string | null;
  projectId: string | null;
  documentId: string | null;
  createdAt: Date | string;
  user: { name: string } | null;
  project: { name: string } | null;
};

const COLLAPSED = 10;
const EXPANDED = 50;

export function ActivityFeed({ activities }: { activities: FeedActivity[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = activities.slice(0, expanded ? EXPANDED : COLLAPSED);

  return (
    <>
      <Card className="flex flex-col gap-2.5 p-4">
        {activities.length === 0 && (
          <p className="text-xs text-muted">No activity yet.</p>
        )}

        {shown.map((a) => {
          // Link into the exact document when we know it, else the project.
          const href =
            a.documentId && a.projectId
              ? `/projects/${a.projectId}/documents/${a.documentId}`
              : a.projectId
              ? `/projects/${a.projectId}`
              : null;

          const body = (
            <>
              <span className="font-medium">{a.user?.name ?? "Someone"}</span>{" "}
              <span className="text-muted">{a.action.replace(/_/g, " ")}</span>
              {a.detail ? <span className="text-muted"> — {a.detail}</span> : null}
              <div className="text-[10px] text-muted">
                {a.project?.name ? `${a.project.name} · ` : ""}
                {timeAgo(a.createdAt)}
              </div>
            </>
          );

          return href ? (
            <Link
              key={a.id}
              href={href}
              className="-mx-2 block rounded px-2 py-0.5 text-xs hover:bg-surface-2"
            >
              {body}
            </Link>
          ) : (
            <div key={a.id} className="text-xs">
              {body}
            </div>
          );
        })}
      </Card>

      {activities.length > COLLAPSED && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full rounded-lg border border-border py-1.5 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          {expanded ? "ดูน้อยลง" : `ดูเพิ่มเติม (${Math.min(activities.length, EXPANDED) - COLLAPSED})`}
        </button>
      )}
    </>
  );
}
