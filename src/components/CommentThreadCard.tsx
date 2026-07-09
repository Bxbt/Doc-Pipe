"use client";

import { useState } from "react";
import { Check, RotateCcw, Pencil, Trash2, CornerDownRight } from "lucide-react";
import { useComments } from "./CommentsContext";
import { addComment, editComment, deleteComment, resolveThread } from "@/lib/actions";
import { timeAgo, cn } from "@/lib/utils";
import type { CommentThreadFull } from "@/lib/queries";

// One comment thread: its comments, reply box, resolve/reopen, and edit/delete
// on your own comments. Shared by the sidebar panel and the inline popover.
// `showJump` renders the "jump to block" snippet (panel only — the popover is
// already at the block).
export function ThreadCard({
  thread,
  showJump = true,
  alwaysReply = false,
}: {
  thread: CommentThreadFull;
  showJump?: boolean;
  // `alwaysReply` keeps the add box visible (inline popover); otherwise the box
  // reveals on a "Reply" click, as the sidebar console does.
  alwaysReply?: boolean;
}) {
  const { projectId, docId, currentUser, canAdmin, activeThreadId, setActiveThreadId, pending, run } = useComments();
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const active = activeThreadId === thread.id;
  const inline = thread.anchorBlock != null || thread.anchorQuote != null;

  function submitReply() {
    const body = reply.trim();
    if (!body) return;
    run(async () => {
      await addComment(projectId, docId, { threadId: thread.id, body });
      setReply("");
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 transition-colors",
        active ? "border-brand bg-brand/5" : "border-border bg-surface-2",
        thread.resolved && "opacity-70"
      )}
    >
      {showJump && inline && (
        <button
          type="button"
          onClick={() => setActiveThreadId(active ? null : thread.id)}
          className="mb-1.5 block w-full truncate rounded border-l-2 border-brand/50 bg-surface px-1.5 py-0.5 text-left text-[11px] text-muted hover:text-fg"
          title="Jump to the commented block"
        >
          “{thread.anchorQuote || "anchored block"}”
        </button>
      )}

      {thread.resolved && (
        <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 text-[10px] text-emerald-300">
          <Check size={10} /> Resolved{thread.resolvedByName ? ` · ${thread.resolvedByName}` : ""}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {thread.comments.map((c) => {
          const mine = c.authorId === currentUser.id;
          return (
            <div key={c.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold">{c.authorName}</span>
                <span className="text-[10px] text-muted">
                  {timeAgo(c.createdAt)}
                  {c.editedAt && " · edited"}
                </span>
              </div>
              {editId === c.id ? (
                <div className="mt-1">
                  <textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    rows={2}
                    className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-brand"
                  />
                  <div className="mt-1 flex justify-end gap-2">
                    <button className="text-xs text-muted hover:text-fg" onClick={() => setEditId(null)}>
                      Cancel
                    </button>
                    <button
                      className="rounded bg-brand px-2 py-0.5 text-xs text-white disabled:opacity-50"
                      disabled={pending || !editBody.trim()}
                      onClick={() => run(async () => { await editComment(c.id, editBody); setEditId(null); })}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap break-words text-fg/90">{c.body}</p>
              )}
              {(mine || canAdmin) && editId !== c.id && (
                <div className="mt-0.5 flex gap-2">
                  {mine && (
                    <button
                      className="inline-flex items-center gap-0.5 text-[10px] text-muted hover:text-fg"
                      onClick={() => { setEditId(c.id); setEditBody(c.body); }}
                    >
                      <Pencil size={10} /> Edit
                    </button>
                  )}
                  <button
                    className="inline-flex items-center gap-0.5 text-[10px] text-muted hover:text-red-400"
                    onClick={() => { if (confirm("Delete this comment?")) run(() => deleteComment(c.id)); }}
                  >
                    <Trash2 size={10} /> Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls. In the sidebar console (default) "Reply" reveals the box and
          sits next to Resolve; inline popovers keep the box always visible. */}
      <div className="mt-2 flex items-center gap-2 border-t border-border/60 pt-2">
        {!alwaysReply && (
          <button
            type="button"
            onClick={() => setReplying((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg"
          >
            <CornerDownRight size={11} /> Reply
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => resolveThread(thread.id, !thread.resolved))}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-fg disabled:opacity-50"
        >
          {thread.resolved ? <><RotateCcw size={11} /> Reopen</> : <><Check size={11} /> Resolve</>}
        </button>
      </div>

      {(alwaysReply || replying) && (
        <div className="mt-2 flex items-end gap-1.5">
          <textarea
            autoFocus={replying}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReply();
              if (e.key === "Escape" && !alwaysReply) { setReplying(false); setReply(""); }
            }}
            rows={1}
            placeholder="Add a comment…"
            className="min-h-[32px] w-full flex-1 resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={submitReply}
            disabled={pending || !reply.trim()}
            className="shrink-0 rounded-md bg-brand px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
