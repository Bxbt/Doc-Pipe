"use client";

import { useEffect, useRef, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

// Markdown has no field for image size, so a resized image would reset on
// reload. We round-trip BlockNote's `previewWidth` through a `#w=<px>` fragment
// on the image URL (fragments aren't sent to the server, and it stays valid
// markdown). See the matching <img> handling in Markdown.tsx for the view.
/* eslint-disable @typescript-eslint/no-explicit-any */
function applyImageWidthsFromUrl(blocks: any[]) {
  for (const b of blocks ?? []) {
    if (b?.type === "image" && typeof b.props?.url === "string") {
      const m = /#w=(\d+)$/.exec(b.props.url);
      if (m) {
        b.props.previewWidth = Number(m[1]);
        b.props.url = b.props.url.replace(/#w=\d+$/, "");
      }
    }
    if (b?.children?.length) applyImageWidthsFromUrl(b.children);
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Rich block editor (Notion-style) built on BlockNote.
 *
 * Content is stored as **HTML** so every formatting choice survives a save —
 * colour, underline, text/image alignment, and image size, none of which
 * Markdown can represent. Older documents saved as Markdown still load fine:
 * the parser is chosen by sniffing the content on mount.
 */
export function BlockEditor({
  docId,
  initialMarkdown,
  onChange,
}: {
  // When set, images browse/paste/drag upload through that document's
  // attachment API. Without it (e.g. the Document Library), images can still be
  // embedded by URL — there is just no per-document upload target.
  docId?: string;
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}) {
  // Browse / paste / drag images straight into the content — routed through the
  // existing attachment API (volume storage, MIME + size validation). Returns
  // the served URL so it embeds as ![](…/api/attachments/<id>) markdown.
  const editor = useCreateBlockNote(
    docId
      ? {
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
        }
      : {}
  );
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

  // Parse the incoming content once the editor exists. New content is stored as
  // HTML (lossless for colour/underline/alignment/image size); older documents
  // are Markdown, so we detect and parse accordingly for backward compatibility.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const src = initialMarkdown || "";
      const isHtml = /^\s*</.test(src);
      const blocks = isHtml
        ? await editor.tryParseHTMLToBlocks(src)
        : await editor.tryParseMarkdownToBlocks(src);
      if (cancelled) return;
      // Only legacy Markdown carried image widths in a #w= URL fragment.
      if (!isHtml) applyImageWidthsFromUrl(blocks);
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

  // Save as HTML so all formatting persists (Markdown can't hold colour,
  // underline, alignment, or image size).
  async function handleChange() {
    if (loadingRef.current) return;
    const html = await editor.blocksToHTMLLossy(editor.document);
    onChange(html);
  }

  return (
    <div className="bn-wrap" data-ready={ready}>
      <BlockNoteView editor={editor} theme={theme} onChange={handleChange} />
    </div>
  );
}
