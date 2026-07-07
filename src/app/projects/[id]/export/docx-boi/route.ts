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
import { storedPath } from "@/lib/storage";
import { formatDate } from "@/lib/utils";

// Phase 2 — export a project using the REAL BOI SRS Word template as the format
// layer. The template (public/boi/SRS_Template.tagged.docx) keeps its cover,
// header/logo, footer, fonts, styles and section headings; Doc-Pipe fills each
// of the 16 sections with the matching document's content (rendered to OOXML
// and injected via docxtemplater's {@rawXml}), plus the revision history table.
//
// Sections are rendered in ONE html-to-docx pass so their list numbering and
// image relationships stay internally consistent; that pass's numbering.xml,
// media files and image relationships are then merged into the template output
// (with ids remapped so they can't collide with the template's own). This is
// what makes bullet/numbered lists and embedded images survive the injection.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The BOI sections filled from Doc-Pipe documents (matched by the custom
// doc-type key of the "BOI SRS" business type). Must match the {@body<KEY>}
// slots produced by scripts/tag-boi-template.py — all 16 sections, including
// the commercial ones (Payment / Software Agreement / Signatures), are filled
// from the project's own documents.
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
  "PAYMENT_METHOD",
  "SOFTWARE_AGREEMENT",
  "SIGNATURES",
] as const;

const HTDOCX_OPTS = {
  margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 },
  font: "TH Sarabun New",
  table: { row: { cantSplit: true } },
};

const NOTE_NO_DOC = `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">— ยังไม่มีเอกสารในส่วนนี้ —</w:t></w:r></w:p>`;

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

// Inline attachment images as base64 data URIs so html-to-docx actually embeds
// them (the /api/attachments/<id> URLs aren't reachable). A non-image or missing
// attachment degrades to a note rather than breaking the render.
async function embedImages(html: string): Promise<string> {
  const ids = new Set<string>();
  const finder = /\/api\/attachments\/([a-z0-9]+)/gi;
  for (let m; (m = finder.exec(html)); ) ids.add(m[1]);
  if (ids.size === 0) return html;
  const dataUri = new Map<string, string>();
  const atts = await prisma.attachment.findMany({ where: { id: { in: [...ids] } } });
  for (const a of atts) {
    if (!a.mime?.startsWith("image/")) continue;
    try {
      const buf = await readFile(storedPath(a.storedName));
      dataUri.set(a.id, `data:${a.mime};base64,${buf.toString("base64")}`);
    } catch {
      /* file missing — falls through to the placeholder */
    }
  }
  return html.replace(
    /<img\b[^>]*\bsrc="\/api\/attachments\/([a-z0-9]+)[^"]*"[^>]*>/gi,
    (_full, id) =>
      dataUri.get(id) ? `<img src="${dataUri.get(id)}" />` : `<p><em>[รูปภาพแนบ]</em></p>`
  );
}

// Extract the block-level OOXML from a standalone html-to-docx render. Used for
// the revision-history table, which has no lists or images (so no sidecar merge
// is needed). html-to-docx emits the body <w:sectPr> first — drop it.
async function renderSimpleOoxml(html: string): Promise<string> {
  if (!html.trim()) return "<w:p/>";
  let buffer: Buffer;
  try {
    buffer = await HTMLtoDOCX(`<!doctype html><html><body>${html}</body></html>`, null, HTDOCX_OPTS);
  } catch {
    return "<w:p/>";
  }
  const zip = await JSZip.loadAsync(buffer);
  const xml = (await zip.file("word/document.xml")?.async("string")) || "";
  const m = xml.match(/<w:body>([\s\S]*)<\/w:body>/);
  if (!m) return "<w:p/>";
  return m[1].replace(/^\s*<w:sectPr[\s\S]*?<\/w:sectPr>/, "").trim() || "<w:p/>";
}

// Id offsets read from the template so merged numbering/relationship ids can't
// collide with the ones the template already uses.
type Offsets = { absOffset: number; numOffset: number; ridStart: number };

function templateOffsets(tplZip: PizZip): Offsets {
  const num = tplZip.file("word/numbering.xml")?.asText() || "";
  const absMax = Math.max(0, ...[...num.matchAll(/w:abstractNumId="(\d+)"/g)].map((m) => +m[1]));
  const numMax = Math.max(0, ...[...num.matchAll(/<w:num\s+w:numId="(\d+)"/g)].map((m) => +m[1]));
  const rels = tplZip.file("word/_rels/document.xml.rels")?.asText() || "";
  const ridMax = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]));
  return { absOffset: absMax + 1, numOffset: numMax + 1, ridStart: ridMax + 1 };
}

type Merged = {
  bodies: Map<string, string>; // section key -> injectable OOXML chunk
  abstracts: string; // <w:abstractNum> blocks to add to numbering.xml
  nums: string; // <w:num> blocks to add to numbering.xml
  media: { name: string; data: Buffer }[];
  relsAppend: string; // <Relationship> lines to add for images
};

// Render every section in ONE html-to-docx pass (sentinel paragraphs mark the
// boundaries), then remap its numbering/relationship/drawing ids off the
// template's ranges and split the body back into per-section chunks.
async function renderSectionsMerged(htmlByKey: Map<string, string>, off: Offsets): Promise<Merged> {
  const empty: Merged = { bodies: new Map(), abstracts: "", nums: "", media: [], relsAppend: "" };
  if (htmlByKey.size === 0) return empty;

  const keys = [...htmlByKey.keys()];
  const combined = keys.map((k) => `<p>@@SEC_${k}_ENDSEC@@</p>${htmlByKey.get(k) || ""}`).join("");

  const buffer = await HTMLtoDOCX(`<!doctype html><html><body>${combined}</body></html>`, null, HTDOCX_OPTS);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = (await zip.file("word/document.xml")?.async("string")) || "";
  const bm = docXml.match(/<w:body>([\s\S]*)<\/w:body>/);
  let body = bm ? bm[1].replace(/^\s*<w:sectPr[\s\S]*?<\/w:sectPr>/, "").trim() : "";

  // list numbering: shift every numId so it maps to the merged definitions.
  body = body.replace(/(<w:numId\s+w:val=")(\d+)("\s*\/>)/g, (_m, a, n, c) => a + (+n + off.numOffset) + c);

  // image relationships: remap rId, collect media + rels to append.
  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) || "";
  const imgRels = relsXml.match(/<Relationship\b[^>]*Type="[^"]*\/image"[^>]*\/>/g) || [];
  const ridMap = new Map<string, string>();
  const appendRels: string[] = [];
  imgRels.forEach((rel, i) => {
    const oldId = rel.match(/Id="(rId\d+)"/)?.[1];
    const target = rel.match(/Target="([^"]+)"/)?.[1];
    if (!oldId || !target) return;
    const newId = `rId${off.ridStart + i}`;
    ridMap.set(oldId, newId);
    appendRels.push(
      `<Relationship Id="${newId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}" TargetMode="Internal"/>`
    );
  });
  body = body.replace(/r:embed="(rId\d+)"/g, (m, old) => (ridMap.has(old) ? `r:embed="${ridMap.get(old)}"` : m));

  // every embedded image needs a unique drawing id (html-to-docx hardcodes 1).
  let idc = 900000;
  body = body.replace(/(<wp:docPr\b[^>]*\bid=")\d+(")/g, (_m, a, c) => a + idc++ + c);
  body = body.replace(/(<pic:cNvPr\b[^>]*\bid=")\d+(")/g, (_m, a, c) => a + idc++ + c);

  // media files (unique nanoid names — copy as-is).
  const media: { name: string; data: Buffer }[] = [];
  for (const fn of Object.keys(zip.files)) {
    if (fn.startsWith("word/media/") && !zip.files[fn].dir) {
      media.push({ name: fn.slice("word/media/".length), data: await zip.file(fn)!.async("nodebuffer") });
    }
  }

  // numbering definitions (remapped). Schema needs all <w:abstractNum> before
  // all <w:num>, so keep them split for insertion at the right spots.
  const numXml = (await zip.file("word/numbering.xml")?.async("string")) || "";
  const abstracts = (numXml.match(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g) || [])
    .map((b) =>
      b.replace(/(<w:abstractNum\b[^>]*\bw:abstractNumId=")(\d+)(")/g, (_m, a, n, c) => a + (+n + off.absOffset) + c)
    )
    .join("");
  const nums = (numXml.match(/<w:num\b[\s\S]*?<\/w:num>/g) || [])
    .map((b) =>
      b
        .replace(/(<w:num\b[^>]*\bw:numId=")(\d+)(")/g, (_m, a, n, c) => a + (+n + off.numOffset) + c)
        .replace(/(<w:abstractNumId\b[^>]*\bw:val=")(\d+)(")/g, (_m, a, n, c) => a + (+n + off.absOffset) + c)
    )
    .join("");

  // split the body back into per-section chunks at the sentinel paragraphs.
  const marked = body.replace(
    /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?@@SEC_(\w+)_ENDSEC@@(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g,
    (_m, key) => `@@@CUT:${key}@@@`
  );
  const segs = marked.split(/@@@CUT:(\w+)@@@/);
  const bodies = new Map<string, string>();
  for (let i = 1; i < segs.length; i += 2) {
    const chunk = (segs[i + 1] || "").trim();
    bodies.set(segs[i], chunk || "<w:p/>");
  }

  return { bodies, abstracts, nums, media, relsAppend: appendRels.join("") };
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

  // Per-section HTML for every section that actually has a document.
  const byType = new Map(docs.map((d) => [d.type, d]));
  const htmlByKey = new Map<string, string>();
  for (const key of SECTION_KEYS) {
    const doc = byType.get(key);
    if (doc) htmlByKey.set(key, await embedImages(contentToHtml(doc.content)));
  }

  // Render all sections together (lists + images survive); fall back to a plain
  // per-section render (images stripped) if the merge pass throws.
  let merged: Merged;
  try {
    const off = templateOffsets(new PizZip(await readFile(boiTemplatePath())));
    merged = await renderSectionsMerged(htmlByKey, off);
  } catch {
    merged = { bodies: new Map(), abstracts: "", nums: "", media: [], relsAppend: "" };
    for (const [k, h] of htmlByKey) {
      merged.bodies.set(k, await renderSimpleOoxml(h.replace(/<img\b[^>]*>/gi, "<p><em>[รูปภาพ]</em></p>")));
    }
  }

  const templateData: Record<string, string> = { projectName: project.name };
  templateData.revisionTable = await renderSimpleOoxml(revisionHtml);
  for (const key of SECTION_KEYS) {
    templateData[`body${key}`] = htmlByKey.has(key) ? merged.bodies.get(key) || "<w:p/>" : NOTE_NO_DOC;
  }

  const templateBuf = await readFile(boiTemplatePath());
  const dt = new Docxtemplater(new PizZip(templateBuf), { paragraphLoop: true });
  dt.render(templateData);
  const outZip = dt.getZip() as PizZip;

  // Merge the rendered sections' sidecar parts into the template output.
  if (merged.abstracts || merged.nums) {
    let numXml = outZip.file("word/numbering.xml")?.asText() || "";
    if (numXml) {
      if (merged.abstracts) {
        numXml = /<w:num\s/.test(numXml)
          ? numXml.replace(/<w:num\s/, (m) => merged.abstracts + m)
          : numXml.replace("</w:numbering>", merged.abstracts + "</w:numbering>");
      }
      if (merged.nums) numXml = numXml.replace("</w:numbering>", merged.nums + "</w:numbering>");
      outZip.file("word/numbering.xml", numXml);
    }
  }
  for (const m of merged.media) outZip.file(`word/media/${m.name}`, m.data);
  // Injected image drawings use the DrawingML `a:` and `pic:` prefixes, but the
  // template's <w:document> root only declares them when its own body has inline
  // images (the logo lives in the header) — so they can be absent. Declare any
  // that are missing, or Word rejects the file ("experienced an error…").
  if (merged.media.length) {
    let docXml = outZip.file("word/document.xml")?.asText() || "";
    if (docXml) {
      docXml = docXml.replace(/<w:document\b[^>]*>/, (tag) => {
        let out = tag;
        if (!/\bxmlns:a=/.test(out)) {
          out = out.replace(/>$/, ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">');
        }
        if (!/\bxmlns:pic=/.test(out)) {
          out = out.replace(/>$/, ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">');
        }
        return out;
      });
      outZip.file("word/document.xml", docXml);
    }
  }
  if (merged.relsAppend) {
    const rels = outZip.file("word/_rels/document.xml.rels")?.asText() || "";
    if (rels) {
      outZip.file(
        "word/_rels/document.xml.rels",
        rels.replace("</Relationships>", merged.relsAppend + "</Relationships>")
      );
    }
  }
  if (merged.media.length) {
    let ct = outZip.file("[Content_Types].xml")?.asText() || "";
    if (ct) {
      for (const ext of new Set(merged.media.map((m) => m.name.split(".").pop()!.toLowerCase()))) {
        if (!new RegExp(`Extension="${ext}"`, "i").test(ct)) {
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : `image/${ext}`;
          ct = ct.replace("</Types>", `<Default Extension="${ext}" ContentType="${mime}"/></Types>`);
        }
      }
      outZip.file("[Content_Types].xml", ct);
    }
  }

  const out: Buffer = outZip.generate({ type: "nodebuffer" });

  const filenameBase = project.name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "project";
  return new Response(out as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filenameBase}_BOI_SRS.docx"`,
      "Cache-Control": "no-store",
    },
  });
}

function boiTemplatePath(): string {
  return path.join(process.cwd(), "public", "boi", "SRS_Template.tagged.docx");
}
