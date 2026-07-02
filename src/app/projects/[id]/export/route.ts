import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { getCurrentUser } from "@/lib/auth";
import { getProjectFull, overallCompletion } from "@/lib/queries";
import { docLabel, docShort } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// Slugify a document id/title into a stable in-page anchor.
function anchor(id: string): string {
  return `doc-${id}`;
}

// New documents store HTML (from the block editor); seeded/older ones store
// Markdown. Emit HTML as-is; render Markdown to HTML the same way the app's
// document view does (GFM: tables, task lists, headings) so the bundle matches
// what users see on screen.
function contentToHtml(content: string): string {
  if (/^\s*</.test(content)) return content;
  return micromark(content, {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}

const STATUS_COLOR: Record<string, string> = {
  Draft: "#a1a1aa",
  InReview: "#f59e0b",
  Approved: "#10b981",
  Outdated: "#ef4444",
};

function statusPill(status: string, outdated: boolean): string {
  const label = outdated ? "Outdated" : status === "InReview" ? "In Review" : status;
  const color = STATUS_COLOR[outdated ? "Outdated" : status] ?? "#a1a1aa";
  return `<span class="pill" style="color:${color};border-color:${color}">${esc(label)}</span>`;
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Access is gated by Cloudflare Access in production; this also ensures a
  // valid app user locally.
  await getCurrentUser();

  const data = await getProjectFull(params.id);
  if (!data) return new Response("Not found", { status: 404 });

  const { project } = data;
  const docs = project.documents;
  const completion = overallCompletion(docs);
  const members = project.members.map((m) => ({ name: m.user.name, role: m.user.role }));
  const exportedAt = new Date().toLocaleString();

  const toc = docs
    .map(
      (d, i) =>
        `<li><a href="#${anchor(d.id)}"><span class="toc-num">${i + 1}.</span> ${esc(
          docLabel(d.type)
        )} — ${esc(d.title)}</a> ${statusPill(d.status, d.outdated)}</li>`
    )
    .join("\n");

  const sections = docs
    .map(
      (d, i) => `
<section class="doc" id="${anchor(d.id)}">
  <div class="doc-head">
    <div class="doc-badge">${esc(docShort(d.type))}</div>
    <div>
      <div class="doc-type">${esc(docLabel(d.type))}</div>
      <h2>${i + 1}. ${esc(d.title)}</h2>
      <div class="doc-meta">
        ${statusPill(d.status, d.outdated)}
        <span>${esc(d.version)}</span>
        ${d.updatedBy?.name ? `<span>updated by ${esc(d.updatedBy.name)}</span>` : ""}
      </div>
    </div>
  </div>
  <div class="doc-body">${contentToHtml(d.content)}</div>
</section>`
    )
    .join("\n");

  const filenameBase = project.name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "project";
  const url = new URL(req.url);
  const isDownload = url.searchParams.get("download") === "1";
  const autoPrint = url.searchParams.get("print") === "1";

  const toolbar = isDownload
    ? ""
    : `<div class="toolbar no-print">
      <span class="tb-title">${esc(project.name)}</span>
      <span class="tb-spacer"></span>
      <a class="btn" href="?download=1" download="${esc(filenameBase)}.html">⬇ Download .html</a>
      <button class="btn primary" onclick="window.print()">🖨 Save as PDF</button>
    </div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(project.name)} — Project Export</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f4f4f5;
    color: #18181b;
    font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .page { max-width: 820px; margin: 0 auto; padding: 32px 40px 80px; background: #fff; }
  .toolbar {
    position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 10px;
    padding: 12px 40px; background: #18181b; color: #fff;
  }
  .tb-title { font-weight: 600; font-size: 14px; }
  .tb-spacer { flex: 1; }
  .btn {
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    padding: 7px 12px; border-radius: 8px; border: 1px solid #52525b; background: #27272a;
    color: #fff; font-size: 13px; text-decoration: none;
  }
  .btn.primary { background: #6366f1; border-color: #6366f1; }
  .cover h1 { font-size: 28px; margin: 0 0 6px; }
  .cover .desc { color: #52525b; margin: 0 0 18px; max-width: 60ch; }
  .meta-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px 24px; font-size: 13px; }
  .meta-grid .k { color: #71717a; }
  .members { margin-top: 14px; font-size: 13px; }
  .members .chip {
    display: inline-block; margin: 2px 4px 2px 0; padding: 3px 9px;
    border: 1px solid #e4e4e7; border-radius: 999px; background: #fafafa;
  }
  hr { border: 0; border-top: 1px solid #e4e4e7; margin: 26px 0; }
  h2 { font-size: 20px; margin: 4px 0; }
  .toc { font-size: 14px; }
  .toc ul { list-style: none; padding: 0; margin: 0; }
  .toc li { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px dashed #ececee; }
  .toc a { color: #3730a3; text-decoration: none; flex: 1; }
  .toc-num { color: #a1a1aa; display: inline-block; width: 26px; }
  .pill { display: inline-block; padding: 1px 8px; font-size: 11px; font-weight: 600; border: 1px solid; border-radius: 999px; }
  .doc { margin-top: 34px; }
  .doc-head { display: flex; gap: 12px; align-items: flex-start; padding-bottom: 10px; border-bottom: 2px solid #18181b; }
  .doc-badge {
    flex: none; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
    border-radius: 10px; background: #f4f4f5; color: #52525b; font-weight: 700; font-size: 12px;
  }
  .doc-type { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #71717a; }
  .doc-meta { display: flex; gap: 10px; align-items: center; font-size: 12px; color: #71717a; margin-top: 4px; }
  .doc-body { margin-top: 14px; }
  .doc-body img { max-width: 100%; height: auto; }
  .doc-body table { border-collapse: collapse; width: 100%; }
  .doc-body th, .doc-body td { border: 1px solid #d4d4d8; padding: 6px 9px; text-align: left; }
  .doc-body pre { background: #f4f4f5; padding: 12px; border-radius: 8px; overflow: auto; }
  .doc-body code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e4e4e7; font-size: 11px; color: #a1a1aa; }
  @media print {
    body { background: #fff; }
    .no-print { display: none !important; }
    .page { max-width: none; margin: 0; padding: 0; }
    .doc { page-break-before: always; }
    a { color: inherit; text-decoration: none; }
    @page { margin: 18mm 16mm; }
  }
</style>
</head>
<body>
${toolbar}
<div class="page">
  <div class="cover">
    <h1>${esc(project.name)}</h1>
    ${project.description ? `<p class="desc">${esc(project.description)}</p>` : ""}
    <div class="meta-grid">
      <div><span class="k">Customer:</span> ${esc(project.customer ?? "—")}</div>
      <div><span class="k">Business type:</span> ${esc(project.businessType)}</div>
      <div><span class="k">Status:</span> ${esc(project.status)}</div>
      <div><span class="k">Completion:</span> ${completion}%</div>
      <div><span class="k">Timeline:</span> ${esc(formatDate(project.startDate))} → ${esc(
    formatDate(project.endDate)
  )}</div>
      <div><span class="k">Documents:</span> ${docs.length}</div>
    </div>
    ${
      members.length
        ? `<div class="members"><span class="k">Team:</span> ${members
            .map((m) => `<span class="chip">${esc(m.name)} · ${esc(m.role)}</span>`)
            .join("")}</div>`
        : ""
    }
  </div>

  <hr />

  <div class="toc">
    <h2>Contents</h2>
    <ul>${toc || "<li>No documents yet.</li>"}</ul>
  </div>

  ${sections}

  <div class="footer">Exported from Doc-Pipe · ${esc(exportedAt)}</div>
</div>
${autoPrint ? "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));</script>" : ""}
</body>
</html>`;

  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (isDownload) {
    headers["Content-Disposition"] = `attachment; filename="${filenameBase}.html"`;
  }
  return new Response(html, { headers });
}
