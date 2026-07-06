import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import HTMLtoDOCX from "html-to-docx";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectFull } from "@/lib/queries";
import { docLabel } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

// POC: export a project as a single Word .docx. This is the "Word as format
// layer" idea — Doc-Pipe owns the pipeline/graph/metadata and assembles the
// pipeline documents into one deliverable, auto-filling the Document Revision
// History table from data the app already tracks (version, author, date,
// status, approver). Content is converted from each document's HTML/Markdown.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// Newer documents store HTML (block editor); older/seeded ones store Markdown.
function contentToHtml(content: string): string {
  if (!content?.trim()) return "<p><em>— No content yet —</em></p>";
  if (/^\s*</.test(content)) return content;
  return micromark(content, {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
}

const statusText = (s: string, outdated: boolean) =>
  outdated ? "Outdated" : s === "InReview" ? "In Review" : s;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Access is gated by Cloudflare Access in prod; this also ensures a valid user.
  await getCurrentUser();

  const data = await getProjectFull(params.id);
  if (!data) return new Response("Not found", { status: 404 });
  const { project } = data;
  const docs = project.documents;

  // Approver per document: the person who last moved it to Approved. Pulled from
  // the activity log so the revision table fills itself.
  const approvals = await prisma.activity.findMany({
    where: { projectId: project.id, action: "set_status", detail: { contains: "Approved" } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const approverByDoc = new Map<string, string>();
  for (const a of approvals) {
    if (a.documentId && !approverByDoc.has(a.documentId)) {
      approverByDoc.set(a.documentId, a.user?.name ?? "");
    }
  }

  // ── Document Revision History (auto-filled) ──────────────────────────────
  const revHead = ["ลำดับ", "ชื่อผู้แก้ไข", "วันที่", "รายละเอียด", "เวอร์ชั่น", "ผู้อนุมัติ"];
  const revRows = docs
    .map((d, i) => {
      const editor = d.updatedBy?.name ?? "—";
      const date = formatDate(d.updatedAt);
      const detail = `${docLabel(d.type)} — ${d.title} (${statusText(d.status, d.outdated)})`;
      const approver = d.status === "Approved" ? approverByDoc.get(d.id) || "—" : "—";
      return `<tr>
        <td>${i + 1}</td><td>${esc(editor)}</td><td>${esc(date)}</td>
        <td>${esc(detail)}</td><td>${esc(d.version)}</td><td>${esc(approver)}</td>
      </tr>`;
    })
    .join("\n");

  const revisionTable = `<table>
    <thead><tr>${revHead.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
    <tbody>${revRows || `<tr><td colspan="6">—</td></tr>`}</tbody>
  </table>`;

  // ── Contents + body sections (one per pipeline document) ─────────────────
  const toc = docs
    .map((d, i) => `<p>${i + 1}. ${esc(docLabel(d.type))} — ${esc(d.title)}</p>`)
    .join("\n");

  const sections = docs
    .map(
      (d, i) => `
<h1>${i + 1}. ${esc(docLabel(d.type))} — ${esc(d.title)}</h1>
<p><strong>สถานะ:</strong> ${esc(statusText(d.status, d.outdated))} &nbsp; <strong>เวอร์ชั่น:</strong> ${esc(
        d.version
      )}${d.updatedBy?.name ? ` &nbsp; <strong>แก้ไขล่าสุดโดย:</strong> ${esc(d.updatedBy.name)}` : ""}</p>
${contentToHtml(d.content)}`
    )
    .join('\n<p style="page-break-before:always"></p>\n');

  const exportedAt = new Date().toLocaleString("th-TH");

  const html = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  body { font-family: "TH Sarabun New", "Angsana New", Arial, sans-serif; font-size: 14pt; }
  h1 { font-size: 18pt; }
  h2 { font-size: 15pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #AAAAAA; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #F0F0F0; }
</style></head><body>
  <h1 style="text-align:center">Software Requirement Specification</h1>
  <p style="text-align:center"><strong>${esc(project.name)}</strong></p>
  <table>
    <tr><th>ลูกค้า (Customer)</th><td>${esc(project.customer ?? "—")}</td></tr>
    <tr><th>ประเภทงาน (Business Type)</th><td>${esc(project.businessType)}</td></tr>
    <tr><th>สถานะโครงการ</th><td>${esc(project.status)}</td></tr>
    <tr><th>ระยะเวลา (Timeline)</th><td>${esc(formatDate(project.startDate))} → ${esc(
    formatDate(project.endDate)
  )}</td></tr>
    <tr><th>จำนวนเอกสาร</th><td>${docs.length}</td></tr>
  </table>

  <p style="page-break-before:always"></p>
  <h1>ประวัติการแก้ไขเอกสาร (Document Revision History)</h1>
  ${revisionTable}

  <h1>สารบัญ (Table of Contents)</h1>
  ${toc || "<p>—</p>"}

  <p style="page-break-before:always"></p>
  ${sections}

  <p style="margin-top:24pt;color:#888">Exported from Doc-Pipe · ${esc(exportedAt)}</p>
</body></html>`;

  const buffer: Buffer = await HTMLtoDOCX(html, null, {
    orientation: "portrait",
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    title: project.name,
    pageNumber: true,
    table: { row: { cantSplit: true } },
  });

  const filenameBase =
    project.name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "project";

  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filenameBase}_SRS.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
