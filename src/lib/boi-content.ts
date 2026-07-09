import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

// Render a document's stored content to HTML for the BOI Word export. New
// content is already HTML (BlockNote); older/seed content is Markdown, so it
// runs through micromark. The template supplies each section's heading and
// Doc-Pipe content often opens with its own duplicate <h1>, so a single leading
// heading is dropped.
//
// Lives in lib (not the route module) because a Next route file may only export
// route handlers — exporting this from route.ts fails the build's route-type
// check. Shared by the docx-boi route and its charts sub-route.
export function contentToHtml(content: string): string {
  if (!content?.trim()) return "";
  let html: string;
  try {
    html = /^\s*</.test(content)
      ? content
      : micromark(content, { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  } catch {
    return "";
  }
  return html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/i, "").trim();
}
