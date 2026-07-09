"use client";

import { useState } from "react";
import { MessageSquare, Eye, EyeOff } from "lucide-react";
import { useComments } from "./CommentsContext";
import { addComment } from "@/lib/actions";
import { ThreadCard } from "./CommentThreadCard";

// Sidebar list of every comment thread on the document — doc-level and
// block-anchored — with reply, resolve/reopen, edit/delete, and a toggle to
// hide resolved threads (hidden by default).
export function CommentPanel() {
  const { threads, showResolved, setShowResolved, projectId, docId, pending, run } = useComments();
  const [newBody, setNewBody] = useState("");

  const unresolved = threads.filter((t) => !t.resolved).length;
  const visible = threads.filter((t) => showResolved || !t.resolved);

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare size={14} /> Comments
          {unresolved > 0 && (
            <span className="rounded-full bg-brand/15 px-1.5 text-[11px] font-medium text-brand">{unresolved}</span>
          )}
        </h3>
        <button
          type="button"
          onClick={() => setShowResolved(!showResolved)}
          className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg"
          title={showResolved ? "Hide resolved" : "Show resolved"}
        >
          {showResolved ? <EyeOff size={13} /> : <Eye size={13} />}
          {showResolved ? "Hide resolved" : "Show resolved"}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {visible.length === 0 && (
          <p className="text-xs text-muted">No comments yet. Add one below, or hover a paragraph to comment inline.</p>
        )}
        {visible.map((t) => (
          <ThreadCard key={t.id} thread={t} />
        ))}
      </div>

      {/* New doc-level thread. */}
      <div className="mt-3 border-t border-border pt-3">
        <textarea
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          rows={2}
          placeholder="Add a comment…"
          className="w-full resize-none rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            disabled={pending || !newBody.trim()}
            onClick={() =>
              run(async () => {
                await addComment(projectId, docId, { body: newBody });
                setNewBody("");
              })
            }
            className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            Comment
          </button>
        </div>
      </div>
    </section>
  );
}
