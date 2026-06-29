import { STATUS_STYLE } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_STYLE[status] ?? "border-border bg-surface-2 text-muted",
        className
      )}
    >
      {status === "InReview" ? "In Review" : status}
    </span>
  );
}

const ROLE_STYLE: Record<string, string> = {
  Admin: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Editor: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Reviewer: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Viewer: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        ROLE_STYLE[role] ?? "border-border bg-surface-2 text-muted"
      )}
    >
      {role}
    </span>
  );
}
