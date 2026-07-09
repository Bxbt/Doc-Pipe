"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import type { CommentThreadFull } from "@/lib/queries";

// Shared state for the comment UI. The in-content markers (CommentableDocument)
// and the sidebar list (CommentPanel) both read/write this so clicking a thread
// in one highlights it in the other, and an inline "add" opens an anchored
// composer the panel is aware of.
type Composer = { block: number; quote: string };

type CommentsCtx = {
  projectId: string;
  docId: string;
  threads: CommentThreadFull[];
  currentUser: { id: string; name: string };
  canAdmin: boolean;
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;
  composer: Composer | null;
  openComposer: (block: number, quote: string) => void;
  closeComposer: () => void;
  showResolved: boolean;
  setShowResolved: (v: boolean) => void;
  pending: boolean;
  run: (fn: () => Promise<unknown>) => void;
};

const Ctx = createContext<CommentsCtx | null>(null);

export function useComments(): CommentsCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useComments must be used inside <CommentsProvider>");
  return c;
}

export function CommentsProvider({
  projectId,
  docId,
  threads,
  currentUser,
  canAdmin,
  children,
}: {
  projectId: string;
  docId: string;
  threads: CommentThreadFull[];
  currentUser: { id: string; name: string };
  canAdmin: boolean;
  children: ReactNode;
}) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<unknown>) => {
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  return (
    <Ctx.Provider
      value={{
        projectId,
        docId,
        threads,
        currentUser,
        canAdmin,
        activeThreadId,
        setActiveThreadId,
        composer,
        openComposer: (block, quote) => {
          setComposer({ block, quote });
          setActiveThreadId(null);
        },
        closeComposer: () => setComposer(null),
        showResolved,
        setShowResolved,
        pending,
        run,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

// Match a thread to one of the measured content blocks: by its quote snippet
// first (survives blocks shifting), then by index. Returns null when neither
// matches — an "orphaned" thread that still shows in the panel.
export function matchBlockIndex(
  thread: Pick<CommentThreadFull, "anchorBlock" | "anchorQuote">,
  quotes: string[]
): number | null {
  if (thread.anchorQuote) {
    const q = thread.anchorQuote.trim().slice(0, 60);
    const i = quotes.findIndex((bq) => bq && (bq.startsWith(q) || q.startsWith(bq.slice(0, 60))));
    if (i >= 0) return i;
  }
  if (thread.anchorBlock != null && thread.anchorBlock < quotes.length) return thread.anchorBlock;
  return null;
}
