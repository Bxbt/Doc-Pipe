import { readFile } from "node:fs/promises";
import path from "node:path";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import HTMLtoDOCX from "html-to-docx";
import JSZip from "jszip";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectFull } from "@/lib/queries";
import { docLabel } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

// Phase 2 — export a project using the REAL BOI SRS Word template as the format
// layer. The template (public/boi/SRS_Template.tagged.docx) keeps its cover,
// header/logo, footer, fonts, styles and section headings; Doc-Pipe fills each
// of the 16 sections with the matching document's content (rendered to OOXML
// and injected via docxtemplater's {@rawXml}), plus the revision history table.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The BOI sections filled from Doc-Pipe documents (matched by the custom
// doc-type key of the "BOI SRS" business type). Must match the {@body<KEY>}
// slots produced by scripts/tag-boi-template.py. The commercial/boilerplate
// sections (Payment / Software Agreement / Signatures) are intentionally NOT
// here — the template keeps its own standard tables for those.
const SECTION_KEYS = [
  "RATIONALE",
  "SCOPE_OF_WORK",
  "FUNCTIONAL_REQUIREMENTS",
  "NON_FUNCTIONAL_REQUIREMENTS",
  "SYSTEM_ARCHITECTURE",
  "DATA_MODEL",
  "SECURITY_REQUIREMENTS",
  "EXTERNAL_INTERFACE_REQUIREMENTS",
  "PROCESS_FLOW_SYSTEM_DIAGRAM",
  "PROTOTYPE",
  "SOFTWARE",
  "DEVELOPER_TEAM",
  "TIMELINE",
] as const;

const HTDOCX_OPTS = {
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 },
  font: "TH Sarabun New",
  table: { row: { cantSplit: true } },
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function contentToHtml(content: string): string {
  if (!content?.trim()) return "";
  let html: string;
  try {
    html = /^\s*</.test(content)
      ? content
      : micromark(content, { allowDangerousHtml: true, extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  } catch {
    return "";
  }
  // The template already provides each section's heading, and Doc-Pipe content
  // often opens with its own duplicate <h1> — drop a single leading heading.
  return html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>/i, "").trim();
}

// Render an HTML fragment to a sequence of block-level OOXML (<w:p>/<w:tbl>),
// suitable for {@rawXml} injection. Images are stripped to a note (their
// relationships/media live in html-to-docx's own package and don't survive
// body extraction). html-to-docx emits the body <w:sectPr> first, so drop it.
async function renderBodyOoxml(html: string): Promise<string> {
  const clean = (html || "").replace(
    /<img\b[^>]*>/gi,
    `<p><em>[รูปภาพ — ดูในระบบ Doc-Pipe]</em></p>`
  );
  if (!clean.trim()) return "<w:p/>";
  let buffer: Buffer;
  try {
    buffer = await HTMLtoDOCX(`<!doctype html><html><body>${clean}</body></html>`, null, HTDOCX_OPTS);
  } catch {
    return "<w:p/>";
  }
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) return "<w:p/>";
  const xml = await file.async("string");
  const m = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!m) return "<w:p/>";
  const body = m[1].replace(/^\s*<w:sectPr[\s\S]*?<\/w:sectPr>/, "").trim();
  return body || "<w:p/>";
}

const statusText = (s: string, outdated: boolean) =>
  outdated ? "Outdated" : s === "InReview" ? "In Review" : s;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await getCurrentUser();

  const data = await getProjectFull(params.id);
  if (!data) return new Response("Not found", { status: 404 });
  const { project } = data;
  const docs = project.documents;

  // Approver per document (from the activity log) for the revision table.
  const approvals = await prisma.activity.findMany({
    where: { projectId: project.id, action: "set_status", detail: { contains: "Approved" } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const approverByDoc = new Map<string, string>();
  for (const a of approvals) {
    if (a.documentId && !approverByDoc.has(a.documentId)) approverByDoc.set(a.documentId, a.user?.name ?? "");
  }

  // Revision history table as OOXML.
  const revHead = ["ลำดับ", "ชื่อผู้แก้ไข", "วันที่", "รายละเอียด", "เวอร์ชั่น", "ผู้อนุมัติ"];
  const revBody = docs
    .map((d, i) => {
      const approver = d.status === "Approved" ? approverByDoc.get(d.id) || "—" : "—";
      return `<tr><td>${i + 1}</td><td>${esc(d.updatedBy?.name ?? "—")}</td><td>${esc(
        formatDate(d.updatedAt)
      )}</td><td>${esc(docLabel(d.type))} — ${esc(d.title)} (${esc(
        statusText(d.status, d.outdated)
      )})</td><td>${esc(d.version)}</td><td>${esc(approver)}</td></tr>`;
    })
    .join("");
  const revisionHtml = `<table><thead><tr>${revHead
    .map((h) => `<th>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${
    revBody || `<tr><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`
  }</tbody></table>`;

  // Build the template data: one rawXml body per section, matched by doc type.
  const byType = new Map(docs.map((d) => [d.type, d]));
  const templateData: Record<string, string> = { projectName: project.name };
  templateData.revisionTable = await renderBodyOoxml(revisionHtml);
  for (const key of SECTION_KEYS) {
    const doc = byType.get(key);
    templateData[`body${key}`] = doc
      ? await renderBodyOoxml(contentToHtml(doc.content))
      : `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">— ยังไม่มีเอกสารในส่วนนี้ —</w:t></w:r></w:p>`;
  }

  const templatePath = path.join(process.cwd(), "public", "boi", "SRS_Template.tagged.docx");
  const templateBuf = await readFile(templatePath);
  const zip = new PizZip(templateBuf);
  const dt = new Docxtemplater(zip, { paragraphLoop: true });
  dt.render(templateData);
  const out: Buffer = dt.getZip().generate({ type: "nodebuffer" });

  const filenameBase = project.name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "project";
  return new Response(out as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filenameBase}_BOI_SRS.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
