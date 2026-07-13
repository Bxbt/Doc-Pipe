import { readFile } from "node:fs/promises";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import HTMLtoDOCX from "html-to-docx";
import JSZip from "jszip";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectFull } from "@/lib/queries";
import { getDocTypeOptions } from "@/lib/doc-types";
import { docLabel } from "@/lib/constants";
import { storedPath } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

// POC: export a project as a single Word .docx — the "Word as format layer"
// idea. Doc-Pipe owns the pipeline/graph/metadata and assembles the pipeline
// documents into one BOI-SRS-style deliverable, auto-filling the Document
// Revision History (from version/author/date/status/approver), embedding
// attachment images, and generating Team / Timeline / Signature sections from
// project data. Each document's content is converted from its HTML/Markdown.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// A hard page break that html-to-docx honours (an empty <p style="page-break">
// is dropped; a <div> with page-break-after emits a real <w:br type="page"/>).
const PAGE_BREAK = `<div style="page-break-after:always"></div>`;

// Newer documents store HTML (block editor); older/seeded ones store Markdown.
// Never throws — a document that can't be converted degrades to a note rather
// than failing the whole export.
function contentToHtml(content: string): string {
  if (!content?.trim()) return "<p><em>— ยังไม่มีเนื้อหา —</em></p>";
  try {
    if (/^\s*</.test(content)) return content;
    return micromark(content, {
      allowDangerousHtml: true,
      extensions: [gfm()],
      htmlExtensions: [gfmHtml()],
    });
  } catch {
    return "<p><em>— ไม่สามารถแปลงเนื้อหาได้ —</em></p>";
  }
}

const statusText = (s: string, outdated: boolean) =>
  outdated ? "Outdated" : s === "InReview" ? "In Review" : s;

// Inline attachment images as base64 data URIs so they embed in the .docx (the
// /api/attachments/<id> URLs aren't reachable from Word). An attachment <img>
// that can't be embedded (non-image, or the file is missing) is replaced with a
// placeholder — leaving a relative-URL <img> makes html-to-docx throw.
async function embedImages(html: string): Promise<string> {
  const ids = new Set<string>();
  const finder = /\/api\/attachments\/([a-z0-9]+)/gi;
  for (let m; (m = finder.exec(html)); ) ids.add(m[1]);
  const dataUri = new Map<string, string>();
  if (ids.size > 0) {
    const atts = await prisma.attachment.findMany({ where: { id: { in: [...ids] } } });
    for (const a of atts) {
      if (!a.mime?.startsWith("image/")) continue;
      try {
        const buf = await readFile(storedPath(a.storedName));
        dataUri.set(a.id, `data:${a.mime};base64,${buf.toString("base64")}`);
      } catch {
        /* file missing — will fall through to the placeholder */
      }
    }
  }
  return html.replace(
    /<img\b[^>]*\bsrc="\/api\/attachments\/([a-z0-9]+)[^"]*"[^>]*>/gi,
    (_full, id) =>
      dataUri.get(id) ? `<img src="${dataUri.get(id)}" />` : `<p><em>[รูปภาพแนบ]</em></p>`
  );
}

// html-to-docx@1.8 emits the body-level <w:sectPr> as the FIRST child of
// <w:body>, but OOXML requires it LAST — so Word refuses to open the file
// ("Word experienced an error…"). Move it to the end.
async function moveSectPrToEnd(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) return buffer;
  let xml = await file.async("string");
  const m = xml.match(/<w:body>\s*(<w:sectPr>[\s\S]*?<\/w:sectPr>)/);
  if (!m) return buffer;
  const sectPr = m[1];
  xml = xml.replace(sectPr, "");
  xml = xml.replace("</w:body>", () => `${sectPr}</w:body>`);
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer" });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Access is gated by Cloudflare Access in prod; this also ensures a valid user.
  await getCurrentUser();

  const [data, docTypeOptions] = await Promise.all([
    getProjectFull(params.id),
    getDocTypeOptions(),
  ]);
  if (!data) return new Response("Not found", { status: 404 });
  const { project } = data;
  const docs = project.documents;
  const members = project.members.map((m) => ({ name: m.user.name, role: m.user.role }));

  // Friendly type label (custom Document Library types may be Thai).
  const typeLabelOf = (t: string) =>
    docTypeOptions.find((o) => o.type === t)?.label ?? docLabel(t);

  // Approver per document: who last moved it to Approved (from the activity log).
  const approvals = await prisma.activity.findMany({
    where: { projectId: project.id, action: "set_status", detail: { contains: "Approved", mode: "insensitive" } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const approverByDoc = new Map<string, string>();
  for (const a of approvals) {
    if (a.documentId && !approverByDoc.has(a.documentId)) {
      approverByDoc.set(a.documentId, a.user?.name ?? "");
    }
  }

  // ── Document Revision History (auto-filled from Doc-Pipe data) ────────────
  const revHead = ["ลำดับ", "ชื่อผู้แก้ไข", "วันที่", "รายละเอียด", "เวอร์ชั่น", "ผู้อนุมัติ"];
  const revRows = docs
    .map((d, i) => {
      const editor = d.updatedBy?.name ?? "—";
      const detail = `${typeLabelOf(d.type)} — ${d.title} (${statusText(d.status, d.outdated)})`;
      const approver = d.status === "Approved" ? approverByDoc.get(d.id) || "—" : "—";
      return `<tr><td>${i + 1}</td><td>${esc(editor)}</td><td>${esc(
        formatDate(d.updatedAt)
      )}</td><td>${esc(detail)}</td><td>${esc(d.version)}</td><td>${esc(approver)}</td></tr>`;
    })
    .join("");
  const revisionTable = `<table><thead><tr>${revHead
    .map((h) => `<th>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${
    revRows || `<tr><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`
  }</tbody></table>`;

  // ── Contents ─────────────────────────────────────────────────────────────
  const toc = docs
    .map((d, i) => `<p>${i + 1}. ${esc(typeLabelOf(d.type))} — ${esc(d.title)}</p>`)
    .join("");

  // ── Body: one section per pipeline document (each on a new page) ─────────
  const sections = docs
    .map(
      (d, i) => `<h1>${i + 1}. ${esc(typeLabelOf(d.type))}</h1>
<p style="color:#666"><strong>${esc(d.title)}</strong> — สถานะ ${esc(
        statusText(d.status, d.outdated)
      )} · เวอร์ชั่น ${esc(d.version)}${
        d.updatedBy?.name ? ` · แก้ไขล่าสุดโดย ${esc(d.updatedBy.name)}` : ""
      }</p>
${contentToHtml(d.content)}`
    )
    .join(PAGE_BREAK);

  // ── Generated commercial sections (from project data) ────────────────────
  const teamRows =
    members
      .map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.role)}</td></tr>`)
      .join("") || `<tr><td>—</td><td>—</td></tr>`;
  const teamSection = `<h1>ทีมพัฒนา (Developer Team)</h1>
<table><thead><tr><th>ชื่อ (Name)</th><th>บทบาท (Role)</th></tr></thead><tbody>${teamRows}</tbody></table>`;

  const timelineSection = `<h1>ระยะเวลาดำเนินการ (Timeline)</h1>
<table><tbody>
<tr><th>วันเริ่มต้น (Start)</th><td>${esc(formatDate(project.startDate))}</td></tr>
<tr><th>วันสิ้นสุด (End)</th><td>${esc(formatDate(project.endDate))}</td></tr>
<tr><th>สถานะโครงการ (Status)</th><td>${esc(project.status)}</td></tr>
</tbody></table>`;

  const sigCell = (role: string) =>
    `<td><p>ลงชื่อ ...................................</p><p>( ................................... )</p><p>${esc(
      role
    )}</p><p>วันที่ ......./......./.......</p></td>`;
  const signatureSection = `<h1>ลายมือชื่อ (Signatures)</h1>
<table><tbody><tr>${sigCell("ผู้จัดทำ (Prepared by)")}${sigCell(
    "ผู้ตรวจสอบ (Reviewed by)"
  )}${sigCell("ผู้อนุมัติ (Approved by)")}</tr></tbody></table>`;

  const exportedAt = new Date().toLocaleString("th-TH");

  const body = `<!doctype html><html><head><meta charset="utf-8" />
<style>
  body { font-family: "TH Sarabun New", "Angsana New", Arial, sans-serif; font-size: 14pt; }
  h1 { font-size: 18pt; }
  h2 { font-size: 15pt; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #AAAAAA; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #F0F0F0; }
  img { max-width: 100%; }
</style></head><body>
  <h1 style="text-align:center">Software Requirement Specification</h1>
  <p style="text-align:center;font-size:16pt"><strong>${esc(project.name)}</strong></p>
  ${project.description ? `<p style="text-align:center;color:#555">${esc(project.description)}</p>` : ""}
  <table><tbody>
    <tr><th>ลูกค้า (Customer)</th><td>${esc(project.customer ?? "—")}</td></tr>
    <tr><th>ประเภทงาน (Business Type)</th><td>${esc(project.businessType)}</td></tr>
    <tr><th>สถานะโครงการ</th><td>${esc(project.status)}</td></tr>
    <tr><th>ระยะเวลา (Timeline)</th><td>${esc(formatDate(project.startDate))} → ${esc(
    formatDate(project.endDate)
  )}</td></tr>
    <tr><th>จำนวนเอกสาร</th><td>${docs.length}</td></tr>
  </tbody></table>
  ${PAGE_BREAK}

  <h1>ประวัติการแก้ไขเอกสาร (Document Revision History)</h1>
  ${revisionTable}
  ${PAGE_BREAK}

  <h1>สารบัญ (Table of Contents)</h1>
  ${toc || "<p>—</p>"}
  ${PAGE_BREAK}

  ${sections}
  ${PAGE_BREAK}

  ${teamSection}
  ${timelineSection}
  ${PAGE_BREAK}

  ${signatureSection}

  <p style="margin-top:24pt;color:#888;font-size:11pt">Generated from Doc-Pipe · ${esc(
    exportedAt
  )}</p>
</body></html>`;

  const html = await embedImages(body);

  const options = {
    orientation: "portrait",
    // All six margin keys are required — html-to-docx writes the literal string
    // "undefined" into <w:pgMar> for any omitted one, breaking the file in Word.
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 },
    title: project.name,
    pageNumber: true,
    table: { row: { cantSplit: true } },
  };
  let buffer: Buffer;
  try {
    buffer = await HTMLtoDOCX(html, null, options);
  } catch {
    // Safety net: a single bad image (e.g. an unreachable external URL) can make
    // html-to-docx throw — strip all images and retry so the export never fails.
    const noImages = html.replace(/<img\b[^>]*>/gi, "<p><em>[รูปภาพ]</em></p>");
    buffer = await HTMLtoDOCX(noImages, null, options);
  }
  const fixed = await moveSectPrToEnd(buffer);

  const filenameBase =
    project.name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "project";

  return new Response(fixed as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filenameBase}_SRS.docx"`,
      "Cache-Control": "no-store",
    },
  });
}
