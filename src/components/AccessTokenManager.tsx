"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Copy, Check, Trash2, Plus, AlertTriangle } from "lucide-react";
import { Card } from "./ui";
import { createAccessToken, revokeAccessToken } from "@/lib/actions";
import { timeAgo } from "@/lib/utils";

type TokenLite = {
  id: string;
  name: string;
  preview: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export function AccessTokenManager({ tokens, role }: { tokens: TokenLite[]; role: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canWrite = role === "Admin" || role === "Editor";

  function onCreate() {
    const label = name.trim() || "Untitled token";
    startTransition(async () => {
      const res = await createAccessToken(label);
      setFreshToken(res.raw);
      setName("");
      router.refresh();
    });
  }

  function onCopy() {
    if (!freshToken) return;
    navigator.clipboard.writeText(freshToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function onRevoke(id: string, label: string) {
    if (!confirm(`Revoke "${label}"? Any AI client using it will stop working.`)) return;
    startTransition(async () => {
      await revokeAccessToken(id);
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <div className="flex items-center gap-2">
          <KeyRound size={17} className="text-brand" />
          <h2 className="text-sm font-semibold">Personal access tokens</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          A token lets an AI client (e.g. a local MCP bridge beside your own Claude or ChatGPT)
          act as you over the API. It carries your role — you are{" "}
          <span className="font-medium text-fg">{role}</span>, so this token can{" "}
          {canWrite ? "read and draft documents" : "only read documents"}.
        </p>

        {/* Create */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Token name (e.g. Claude Desktop)"
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-brand"
          />
          <button
            onClick={onCreate}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={14} /> Generate token
          </button>
        </div>

        {/* Freshly created token — shown once */}
        {freshToken && (
          <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-300">
              <AlertTriangle size={13} /> Copy this now — it is shown only once.
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1.5 text-xs">
                {freshToken}
              </code>
              <button
                onClick={onCopy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2"
              >
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Existing tokens */}
      <Card>
        <h3 className="text-sm font-semibold">Active tokens</h3>
        {tokens.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No tokens yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                    <code>{t.preview}</code>
                    <span>created {timeAgo(t.createdAt)}</span>
                    <span>{t.lastUsedAt ? `last used ${timeAgo(t.lastUsedAt)}` : "never used"}</span>
                  </div>
                </div>
                <button
                  onClick={() => onRevoke(t.id, t.name)}
                  disabled={isPending}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                  title="Revoke token"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
