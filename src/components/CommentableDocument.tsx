"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageSquarePlus, MessageSquare, X } from "lucide-react";
import { Markdown } from "./Markdown";
import { useComments, matchBlockIndex } from "./CommentsContext";
import { ThreadCard } from "./CommentThreadCard";
import { addComment } from "@/lib/actions";

type Block = { top: number; height: number; quote: string };

// Read-mode document that lets you attach comments to a content block. It never
// mutates the rendered markup React owns — it measures each top-level block's
// position and draws its own absolutely-positioned gutter markers alongside.
export function CommentableDocument({ content }: { content: string }) {
  const {
    projectId,
    docId,
    threads,
    activeThreadId,
    setActiveThreadId,
    composer,
    openComposer,
    closeComposer,
    showResolved,
    pending,
    run,
  } = useComments();

  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  // Which block's thread popover is open (clicking a gutter marker opens it).
  const [popoverBlock, setPopoverBlock] = useState<number | null>(null);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const prose = contentRef.current?.querySelector(".prose-doc");
    if (!wrap || !prose) return;
    const wrapTop = wrap.getBoundingClientRect().top;
    const next = Array.from(prose.children).map((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return {
        top: r.top - wrapTop,
        height: r.height,
        quote: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
      };
    });
    setBlocks(next);
  }, []);

  // Re-measure on mount, on content change, and whenever the content resizes
  // (images/diagrams load in late and shift everything below them).
  useLayoutEffect(() => {
    measure();
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, content]);

  const quotes = blocks.map((b) => b.quote);

  // Which block does each visible thread live on?
  const threadBlock = (t: (typeof threads)[number]) => matchBlockIndex(t, quotes);
  const visibleThreads = threads.filter((t) => showResolved || !t.resolved);
  const byBlock = new Map<number, typeof threads>();
  for (const t of visibleThreads) {
    const b = threadBlock(t);
    if (b == null) continue;
    const list = byBlock.get(b) ?? [];
    list.push(t);
    byBlock.set(b, list);
  }

  // Highlight + scroll to the active thread's block.
  useEffect(() => {
    const prose = contentRef.current?.querySelector(".prose-doc");
    if (!prose) return;
    const kids = Array.from(prose.children) as HTMLElement[];
    kids.forEach((el) => el.classList.remove("comment-block-active"));
    if (!activeThreadId) return;
    const t = threads.find((x) => x.id === activeThreadId);
    if (!t) return;
    const bi = matchBlockIndex(t, kids.map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100)));
    if (bi == null || !kids[bi]) return;
    kids[bi].classList.add("comment-block-active");
    kids[bi].scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeThreadId, threads, blocks]);

  // Escape clears the current selection / closes an open composer from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveThreadId(null);
        closeComposer();
        setPopoverBlock(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setActiveThreadId, closeComposer]);

  function submitInline() {
    const body = draft.trim();
    if (!body || composer == null) return;
    run(async () => {
      await addComment(projectId, docId, { body, anchorBlock: composer.block, anchorQuote: composer.quote });
      setDraft("");
      closeComposer();
    });
  }

  return (
    // The negative margin + matching left padding widen the hover/click box to
    // cover the gutter where the markers live, so moving onto a marker doesn't
    // leave the element (which used to make the add button vanish mid-reach).
    <div
      ref={wrapRef}
      className="relative -ml-6 pl-6"
      onMouseMove={(e) => {
        const wrapTop = wrapRef.current!.getBoundingClientRect().top;
        const y = e.clientY - wrapTop;
        const i = blocks.findIndex((b) => y >= b.top - 4 && y <= b.top + b.height + 4);
        setHovered(i >= 0 ? i : null);
      }}
      onMouseLeave={() => setHovered(null)}
      onClick={() => { setActiveThreadId(null); setPopoverBlock(null); }}
    >
      {/* Gutter markers: a comment count where threads exist, else an add button
          on the hovered block. Both sit in the left padding (left-0). */}
      {blocks.map((b, i) => {
        const here = byBlock.get(i);
        const top = b.top;
        if (here && here.length) {
          const unresolved = here.filter((t) => !t.resolved).length;
          const isActive = here.some((t) => t.id === activeThreadId);
          return (
            <button
              key={`m${i}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const open = popoverBlock === i;
                setPopoverBlock(open ? null : i);
                setActiveThreadId(open ? null : here[0].id);
              }}
              style={{ top }}
              title={`${here.length} comment thread(s)`}
              className="absolute left-0 flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] text-muted hover:text-fg hover:bg-surface-2"
            >
              <MessageSquare size={13} className={unresolved ? "text-brand" : ""} />
              {here.length > 1 && <span>{here.length}</span>}
            </button>
          );
        }
        if (hovered === i) {
          return (
            <button
              key={`a${i}`}
              type="button"
              onClick={(e) => { e.stopPropagation(); setDraft(""); openComposer(i, b.quote); }}
              style={{ top }}
              title="Comment on this block"
              className="absolute left-0 rounded-md p-0.5 text-muted opacity-70 hover:text-brand hover:opacity-100"
            >
              <MessageSquarePlus size={14} />
            </button>
          );
        }
        return null;
      })}

      <div ref={contentRef}>
        <Markdown>{content || "_No content yet._"}</Markdown>
      </div>

      {/* Inline composer, floated just under the block being commented on. */}
      {composer != null && blocks[composer.block] && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: blocks[composer.block].top + blocks[composer.block].height + 4 }}
          className="absolute left-6 right-0 z-10 rounded-lg border border-brand/40 bg-surface-2 p-2 shadow-lg"
        >
          <p className="mb-1 truncate text-[11px] text-muted">Commenting on: “{composer.quote}”</p>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitInline(); if (e.key === "Escape") closeComposer(); }}
            rows={2}
            placeholder="Add a comment…"
            className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <button type="button" onClick={closeComposer} className="rounded-md px-2 py-1 text-xs text-muted hover:text-fg">
              Cancel
            </button>
            <button
              type="button"
              onClick={submitInline}
              disabled={pending || !draft.trim()}
              className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
            >
              Comment
            </button>
          </div>
        </div>
      )}

      {/* Thread popover — opens from the gutter marker, so a block's comments can
          be read and replied to in place without going to the side panel. */}
      {popoverBlock != null && blocks[popoverBlock] && (byBlock.get(popoverBlock)?.length ?? 0) > 0 && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ top: blocks[popoverBlock].top }}
          className="absolute left-6 z-20 max-h-[60vh] w-[min(360px,100%)] overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-xl"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <span className="truncate pl-1 text-[11px] text-muted">“{blocks[popoverBlock].quote}”</span>
            <button
              type="button"
              onClick={() => { setPopoverBlock(null); setActiveThreadId(null); }}
              className="rounded p-0.5 text-muted hover:text-fg"
              title="Close"
            >
              <X size={13} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {byBlock.get(popoverBlock)!.map((t) => (
              <ThreadCard key={t.id} thread={t} showJump={false} alwaysReply />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
