"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, Lock, X, Plus } from "lucide-react";
import {
  setProjectVisibility,
  addProjectMember,
  removeProjectMember,
  listUsersForSharing,
} from "@/lib/actions";
import { useScrollLock } from "./useScrollLock";

type Member = { userId: string; name: string; email: string; role: string };
type UserOpt = { id: string; name: string; email: string };

export function ShareControl({
  projectId,
  visibility,
  members,
  canManage,
}: {
  projectId: string;
  visibility: string;
  members: Member[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isPrivate = visibility === "private";

  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted"
          title={isPrivate ? "Only members can see this project" : "Everyone signed in can see this project"}
        >
          {isPrivate ? <Lock size={12} /> : <Globe size={12} />}
          {isPrivate ? "Private" : "Public"}
        </span>
        {canManage && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Share
          </button>
        )}
      </div>
      {open && (
        <ShareModal
          projectId={projectId}
          visibility={visibility}
          members={members}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ShareModal({
  projectId,
  visibility,
  members,
  onClose,
}: {
  projectId: string;
  visibility: string;
  members: Member[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useScrollLock(true);

  useEffect(() => {
    listUsersForSharing().then(setUsers).catch(() => {});
  }, []);

  const run = (fn: () => Promise<unknown>) => {
    setErr(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const memberIds = new Set(members.map((m) => m.userId));
  const candidates = users
    .filter((u) => !memberIds.has(u.id))
    .filter((u) => {
      const t = q.trim().toLowerCase();
      return !t || u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t);
    })
    .slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Share project</h2>
          <button onClick={onClose} className="text-muted hover:text-fg"><X size={16} /></button>
        </div>

        {/* Visibility */}
        <div className="space-y-2">
          <VisibilityOption
            label="Public" desc="Everyone signed in can see this project"
            icon={<Globe size={14} />} active={visibility === "public"} disabled={isPending}
            onClick={() => visibility !== "public" && run(() => setProjectVisibility(projectId, "public"))}
          />
          <VisibilityOption
            label="Private" desc="Only people you add can see it"
            icon={<Lock size={14} />} active={visibility === "private"} disabled={isPending}
            onClick={() => visibility !== "private" && run(() => setProjectVisibility(projectId, "private"))}
          />
        </div>

        {/* People */}
        <div className="mt-4 border-t border-border pt-3">
          <div className="mb-2 text-xs font-semibold text-muted">People with access</div>
          <div className="flex flex-col gap-1">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {m.name} {m.role === "owner" && <span className="text-xs text-muted">(owner)</span>}
                </span>
                {m.role !== "owner" && (
                  <button
                    onClick={() => run(() => removeProjectMember(projectId, m.userId))}
                    disabled={isPending}
                    className="text-muted hover:text-red-400"
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add people */}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Add people by name or email…"
            className="mt-3 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {q.trim() && (
            <div className="mt-1 flex flex-col gap-1">
              {candidates.length === 0 && <div className="px-1 py-1 text-xs text-muted">No matches</div>}
              {candidates.map((u) => (
                <button
                  key={u.id}
                  onClick={() => run(() => addProjectMember(projectId, u.id))}
                  disabled={isPending}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                >
                  <Plus size={13} className="text-muted" />
                  <span className="min-w-0 truncate">{u.name} <span className="text-xs text-muted">{u.email}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>

        {err && <p className="mt-3 text-xs text-red-400">{err}</p>}
        {visibility === "public" && (
          <p className="mt-3 text-[11px] text-muted">
            Project is public — the member list applies once you switch it to Private.
          </p>
        )}
      </div>
    </div>
  );
}

function VisibilityOption({
  label, desc, icon, active, disabled, onClick,
}: {
  label: string; desc: string; icon: React.ReactNode; active: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left disabled:opacity-50 ${
        active ? "border-brand bg-brand/10" : "border-border hover:border-brand/50"
      }`}
    >
      <span className="mt-0.5 text-muted">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}{active && " ✓"}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}
