import { createHash } from "node:crypto";

// Server-side helpers for the "render mermaid as a real diagram" export path.
//
// Mermaid diagrams live in the content as ```mermaid fenced code (or, for HTML
// content from BlockNote, a <pre><code class="language-mermaid"> / data-language
// block). micromark/BlockNote turn that into a <pre><code> block whose text is
// the chart source — html-to-docx then prints it verbatim as code, never a
// diagram, because nothing on the server can lay a diagram out.
//
// So the browser (which already has mermaid loaded) renders each chart to a PNG
// at export time and posts them back keyed by a stable hash of the chart source.
// Here we (1) find every chart so the client knows what to render, and (2) swap
// each fenced chart for an <img> pointing at the client-rendered PNG before the
// html-to-docx pass embeds it like any other image.

// A <pre>…</pre> block whose <code> is flagged as mermaid (class or data-language).
const MERMAID_BLOCK =
  /<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi;

function isMermaidCode(attrs: string): boolean {
  return /\b(?:class|className)="[^"]*\b(?:language-)?mermaid\b[^"]*"/i.test(attrs) ||
    /\bdata-language="mermaid"/i.test(attrs);
}

// micromark HTML-escapes the code text; mermaid needs the raw source back.
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:0*39|x0*27);/gi, "'")
    .replace(/&amp;/g, "&");
}

// Stable 16-hex key for a chart, computed the same way on every request so the
// charts endpoint, the client's rendered map, and the export swap all agree.
export function mermaidHash(code: string): string {
  return createHash("sha1").update(code.trim(), "utf8").digest("hex").slice(0, 16);
}

export type MermaidChart = { hash: string; code: string };

// Every distinct mermaid chart in a rendered-HTML string, deduped by hash.
export function extractMermaidCharts(html: string): MermaidChart[] {
  const out = new Map<string, string>();
  for (let m; (m = MERMAID_BLOCK.exec(html)); ) {
    if (!isMermaidCode(m[1])) continue;
    const code = decodeEntities(m[2]).replace(/\n$/, "");
    if (code.trim()) out.set(mermaidHash(code), code);
  }
  return [...out].map(([hash, code]) => ({ hash, code }));
}

// Replace each mermaid <pre><code> block with an <img> of the client-rendered
// PNG (data URI). A chart with no supplied image is left as code — the same
// visible result as before, so a client that fails to render one diagram still
// gets a valid document.
export function swapMermaidImages(html: string, images: Record<string, string>): string {
  return html.replace(MERMAID_BLOCK, (full, attrs: string, inner: string) => {
    if (!isMermaidCode(attrs)) return full;
    const code = decodeEntities(inner).replace(/\n$/, "");
    const uri = images[mermaidHash(code)];
    return uri ? `<p><img src="${uri}" /></p>` : full;
  });
}
