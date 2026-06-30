"use client";

import { useEffect, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

/**
 * POC rich block editor (Notion-style) built on BlockNote.
 *
 * It loads existing **markdown** into blocks, lets the user edit visually,
 * and converts the blocks back to markdown on every change — so the rest of
 * the app keeps storing markdown (versioning, diff, search, export untouched).
 */
export function BlockEditor({
  docId,
  initialMarkdown,
  onChange,
}: {
  docId: string;
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}) {
  // Browse / paste / drag images straight into the content — routed through the
  // existing attachment API (volume storage, MIME + size validation). Returns
  // the served URL so it embeds as ![](…/api/attachments/<id>) markdown.
  const editor = useCreateBlockNote({
    uploadFile: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/documents/${docId}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      const { id } = await res.json();
      return `/api/attachments/${id}`;
    },
  });
  const [ready, setReady] = useState(false);
  // Suppress the onChange that fires while we load the initial content.
  const loadingRef = useRef(true);

  // Match the app's dark/light theme (.dark on <html>).
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () =>
      setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Parse the incoming markdown into blocks once the editor exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const blocks = await editor.tryParseMarkdownToBlocks(initialMarkdown || "");
      if (cancelled) return;
      editor.replaceBlocks(editor.document, blocks);
      loadingRef.current = false;
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Only on mount — we don't want to clobber edits if the prop identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleChange() {
    if (loadingRef.current) return;
    const md = await editor.blocksToMarkdownLossy(editor.document);
    onChange(md);
  }

  return (
    <div className="bn-wrap" data-ready={ready}>
      <BlockNoteView editor={editor} theme={theme} onChange={handleChange} />
    </div>
  );
}
