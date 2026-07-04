"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, User } from "lucide-react";
import { Card } from "./ui";
import { RoleBadge } from "./badges";
import { updateProfile } from "@/lib/actions";

export function ProfileForm({
  user,
}: {
  user: { name: string; email: string; role: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const trimmed = name.trim();
  const dirty = trimmed !== user.name && trimmed.length > 0;

  function onSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateProfile({ name: trimmed });
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        router.refresh();
      } catch (e: any) {
        setError(e?.message ?? "Could not save.");
      }
    });
  }

  return (
    <Card className="flex max-w-md flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-brand-fg">
          <User size={20} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{user.email}</div>
          <div className="mt-0.5">
            <RoleBadge role={user.role} />
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Display name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Your name"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty && !isPending) onSave();
          }}
        />
        <span className="text-[11px] text-muted">
          Shown on activity, documents, and your user menu.
        </span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={!dirty || isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg transition-opacity disabled:opacity-40"
        >
          {saved ? <Check size={15} /> : null}
          {saved ? "Saved" : isPending ? "Saving…" : "Save"}
        </button>
        {dirty && !isPending && !saved && (
          <span className="text-[11px] text-muted">Unsaved changes</span>
        )}
      </div>
    </Card>
  );
}
