import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import htmldiff from "node-htmldiff";

// Version content is HTML for documents saved with the current editor and
// Markdown for older/seed versions — normalize both to HTML before diffing so
// a doc that migrated formats mid-history still diffs cleanly.
export function normalizeToHtml(content: string): string {
  if (!content?.trim()) return "";
  if (/^\s*</.test(content)) return content;
  try {
    return micromark(content, { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  } catch {
    return content;
  }
}

// Word-level HTML diff between two version snapshots. Returns HTML with <ins>
// (added) and <del> (removed) tags; the UI renders it inline or, via CSS, as
// two side-by-side columns (left hides <ins>, right hides <del>).
export function computeDiffHtml(oldContent: string, newContent: string): string {
  return htmldiff(normalizeToHtml(oldContent), normalizeToHtml(newContent));
}
