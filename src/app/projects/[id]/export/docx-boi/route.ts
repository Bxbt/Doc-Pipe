import { readFile } from "node:fs/promises";
import path from "node:path";
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
import { swapMermaidImages } from "@/lib/mermaid-export";
import { contentToHtml } from "@/lib/boi-content";

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

// Pixel dimensions straight from the image header (no decoding library). Covers
// the formats the uploader allows for images; anything unrecognised returns null
// so the caller falls back to a square box.
function imageSize(buf: Buffer, ext: string): { w: number; h: number } | null {
  try {
    if (ext === "png" && buf.readUInt32BE(0) === 0x89504e47) {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (ext === "gif") {
      return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    }
    if (ext === "jpg") {
      let o = 2;
      while (o < buf.length) {
        if (buf[o] !== 0xff) { o++; continue; }
        const marker = buf[o + 1];
        // SOF0–SOF15, excluding the non-dimension DHT/JPG/DAC markers.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
        }
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
  } catch {
    /* malformed header — fall back to a square */
  }
  return null;
}

// The customer's logo comes from the project's "Logo" library document — its
// content is BlockNote HTML holding one attachment image. Return the raw image
// bytes + extension and its natural pixel size so it can be seated on the cover
// beside our own logo at its true aspect ratio.
async function coverLogoImage(
  docs: { type: string; content: string }[]
): Promise<{ data: Buffer; ext: string; w: number; h: number } | null> {
  const doc = docs.find(
    (d) => d.type === "LOGO" || docLabel(d.type).trim().toLowerCase() === "logo"
  );
  if (!doc?.content) return null;
  const id = doc.content.match(/\/api\/attachments\/([a-z0-9]+)/i)?.[1];
  if (!id) return null;
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att?.mime?.startsWith("image/")) return null;
  try {
    const data = await readFile(storedPath(att.storedName));
    const ext = (att.mime.split("/")[1] || "png").toLowerCase().replace("jpeg", "jpg");
    const size = imageSize(data, ext) ?? { w: 1, h: 1 };
    return { data, ext, w: size.w, h: size.h };
  } catch {
    return null;
  }
}

// Clone the template's own cover-logo <w:drawing> (a known-good anchored image)
// and repoint it at the customer logo: new relationship id, unique drawing ids,
// a fresh name, its true aspect ratio (fit inside our logo's square box so it
// never overruns), and a horizontal offset that seats it just left of our logo
// so the two sit side by side, both right-aligned to the same baseline.
const LOGO_BOX = 1423035; // our logo's square extent, in EMU
function customerLogoRun(companyDrawing: string, rid: string, w: number, h: number): string {
  const scale = LOGO_BOX / Math.max(w, h);
  const cx = Math.max(1, Math.round(w * scale));
  const cy = Math.max(1, Math.round(h * scale));
  // Absolute horizontal position: 4 cm to the right of the column (360000
  // EMU/cm), fixed regardless of the logo's width.
  const custX = 1440000;
  const drawing = companyDrawing
    .replace(/r:embed="rId\d+"/, `r:embed="${rid}"`)
    .replace(
      /(<wp:docPr\b[^>]*\bid=")\d+("[^>]*\bname=")[^"]*(")/,
      `$1901001$2customer-logo$3`
    )
    .replace(
      /(<pic:cNvPr\b[^>]*\bid=")\d+("[^>]*\bname=")[^"]*(")/,
      `$1901002$2customer-logo$3`
    )
    .replace(/<wp:extent\b[^>]*\/>/, `<wp:extent cx="${cx}" cy="${cy}"/>`)
    .replace(/<a:ext\b[^>]*\/>/, `<a:ext cx="${cx}" cy="${cy}"/>`)
    .replace(/(<wp:positionH\b[\s\S]*?<wp:posOffset>)-?\d+(<\/wp:posOffset>)/, `$1${custX}$2`);
  return `<w:r><w:rPr><w:noProof/></w:rPr>${drawing}</w:r>`;
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

const TH_FONT = "TH Sarabun New";

// Tag a run as Thai body text: TH Sarabun New for Latin + complex-script,
// 16pt, and the <w:cs/> complex-script flag. Without <w:cs/> Word treats Thai
// as one unbreakable word (it only wraps at spaces, leaving big gaps) and falls
// back to the template's Times New Roman default. rPr child order matters, so
// rFonts goes first and cs last.
function thaiRun(run: string, bold = false, autoColor = false): string {
  const rFonts = `<w:rFonts w:ascii="${TH_FONT}" w:hAnsi="${TH_FONT}" w:cs="${TH_FONT}"/>`;
  const b = bold ? "<w:b/><w:bCs/>" : "";
  // Force black/auto text — overrides the template heading style's blue color.
  const color = autoColor ? '<w:color w:val="auto"/>' : "";
  const size = '<w:sz w:val="32"/><w:szCs w:val="32"/>';
  if (/<w:rPr>/.test(run)) {
    return run.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (_m, body: string) => {
      // rPr child order: rFonts, b, bCs, …, color, sz, szCs, …, cs.
      const prefix =
        (/<w:rFonts\b/.test(body) ? "" : rFonts) +
        (bold && !/<w:b\b/.test(body) ? b : "") +
        (autoColor && !/<w:color\b/.test(body) ? color : "");
      let bb = prefix + body;
      if (!/<w:sz\b/.test(bb)) bb += size;
      if (!/<w:cs\s*\/>/.test(bb)) bb += "<w:cs/>";
      return `<w:rPr>${bb}</w:rPr>`;
    });
  }
  return run.replace(/(<w:r\b[^>]*>)/, `$1<w:rPr>${rFonts}${b}${color}${size}<w:cs/></w:rPr>`);
}

// Give an H2 heading space above and none below (merge into its <w:spacing>,
// or add one right after the <w:pStyle>). Line height is set globally later.
function headingSpacing(inner: string): string {
  const BEFORE = 'w:before="240"';
  const AFTER = 'w:after="0"';
  return inner.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, (_m, b: string) => {
    if (/<w:spacing\b/.test(b)) {
      b = b.replace(/<w:spacing\b([^>]*?)\/?>/, (_s, a: string) => {
        const kept = a.replace(/\s*w:before="[^"]*"/, "").replace(/\s*w:after="[^"]*"/, "");
        return `<w:spacing${kept} ${BEFORE} ${AFTER}/>`;
      });
    } else if (/<w:pStyle\b[^>]*\/>/.test(b)) {
      b = b.replace(/(<w:pStyle\b[^>]*\/>)/, `$1<w:spacing ${BEFORE} ${AFTER}/>`);
    } else {
      b = `<w:spacing ${BEFORE} ${AFTER}/>` + b;
    }
    return `<w:pPr>${b}</w:pPr>`;
  });
}

// Mark the first row of every table as a repeating header, so a table that
// spills onto the next page shows its header row again at the page top
// (Word's "Repeat as header row"). <w:tblHeader/> lives in the row's <w:trPr>.
function repeatTableHeaders(docXml: string): string {
  return docXml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    // First row only (no /g). Its <w:trPr> may be self-closing (<w:trPr/>),
    // a full <w:trPr>…</w:trPr>, or absent — handle all three.
    return tbl.replace(
      /(<w:tr\b[^>]*>)(\s*<w:trPr\s*\/>|\s*<w:trPr>[\s\S]*?<\/w:trPr>)?/,
      (m, open: string, trPr: string | undefined) => {
        if (!trPr || /<w:trPr\s*\/>/.test(trPr)) return `${open}<w:trPr><w:tblHeader/></w:trPr>`;
        if (/<w:tblHeader\b/.test(trPr)) return m; // already set
        // tblHeader is late in the trPr schema order, so append it last.
        return `${open}${trPr.replace("</w:trPr>", "<w:tblHeader/></w:trPr>")}`;
      }
    );
  });
}

// BOI table look for content tables (revision + markdown tables) — NOT the
// template's cover layout tables. Preferred width 16.51cm, #AAAAAA 1/2pt lines
// on every edge (table + cell borders), and a dark navy header row (first row)
// with white text.
const TBL_W_DXA = 9360; // 16.51 cm × 566.93 dxa/cm
const BORDER = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>`;
const TBL_BORDERS = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"]
  .map(BORDER)
  .join("")}</w:tblBorders>`;
const TC_BORDERS = `<w:tcBorders>${["top", "left", "bottom", "right"].map(BORDER).join("")}</w:tcBorders>`;
const HDR_SHD = `<w:shd w:val="clear" w:color="auto" w:fill="041C4D"/>`;
const WHITE = `<w:color w:val="FFFFFF"/>`;

function styleHeaderRow(row: string): string {
  // Shade every cell + vertical-center its text (shd then vAlign follow
  // tcBorders in the tcPr schema order). vAlign matters when a sibling cell
  // wraps and stretches the row — text sits centered, not pinned to the top.
  let r = row.replace(/<\/w:tcBorders>/g, `</w:tcBorders>${HDR_SHD}<w:vAlign w:val="center"/>`);
  // White text on every run.
  r = r.replace(/<w:rPr\/>/g, `<w:rPr>${WHITE}</w:rPr>`);
  r = r.replace(/<w:rPr>(?!<\/w:rPr>)([\s\S]*?)<\/w:rPr>/g, (m, inner: string) =>
    /<w:color\b/.test(inner) ? m : `<w:rPr>${WHITE}${inner}</w:rPr>`
  );
  return r;
}

function styleContentTables(ooxml: string): string {
  if (!ooxml) return ooxml;
  return ooxml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tbl) => {
    // tblPr: preferred width + full borders (drop html-to-docx's own defaults).
    let t = tbl.replace(/<w:tblPr>([\s\S]*?)<\/w:tblPr>/, (_m, inner: string) => {
      const rest = inner
        .replace(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/, "")
        .replace(/<w:tblW\b[^>]*\/>/, "");
      return `<w:tblPr><w:tblW w:w="${TBL_W_DXA}" w:type="dxa"/>${TBL_BORDERS}${rest}</w:tblPr>`;
    });
    // Recolour every cell's borders.
    t = t.replace(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/g, TC_BORDERS);
    // First row = header: navy fill + white text.
    t = t.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/, styleHeaderRow);
    return t;
  });
}

// Force single (1.0) line spacing on every paragraph of the whole document —
// preserving any before/after spacing. Applied once to the final document.xml.
function setSingleLineSpacing(docXml: string): string {
  const LINE = 'w:line="240" w:lineRule="auto"';
  return docXml.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/g, (_m, b: string) => {
    if (/<w:spacing\b/.test(b)) {
      b = b.replace(/<w:spacing\b([^>]*?)\/?>/, (_s, a: string) => {
        const kept = a.replace(/\s*w:line="[^"]*"/, "").replace(/\s*w:lineRule="[^"]*"/, "");
        return `<w:spacing${kept} ${LINE}/>`;
      });
    } else {
      // Insert before ind/jc/rPr (all of which follow spacing in the schema);
      // anything earlier — pStyle, numPr — stays ahead of it.
      const at = b.match(/<w:ind\b|<w:jc\b|<w:rPr>/);
      const sp = `<w:spacing ${LINE}/>`;
      b = at ? b.slice(0, at.index) + sp + b.slice(at.index!) : b + sp;
    }
    return `<w:pPr>${b}</w:pPr>`;
  });
}

// Ensure a paragraph's pPr justifies as thaiDistribute (replacing any existing
// alignment). jc follows ind and precedes the paragraph-mark rPr in the schema.
function ensureThaiDistribute(inner: string): string {
  const JC = '<w:jc w:val="thaiDistribute"/>';
  if (/<w:pPr>/.test(inner)) {
    return inner.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, (_m, b: string) => {
      const cleaned = b.replace(/<w:jc\b[^>]*\/>/g, "");
      const at = cleaned.match(/<w:rPr>/);
      const bb = at ? cleaned.slice(0, at.index) + JC + cleaned.slice(at.index) : cleaned + JC;
      return `<w:pPr>${bb}</w:pPr>`;
    });
  }
  return `<w:pPr>${JC}</w:pPr>${inner}`;
}

// Give each body content paragraph the Thai document look: thaiDistribute
// justification, a first-line indent (720 twips ≈ one tab), and Thai-tagged
// runs (font + complex-script wrapping). Only plain text paragraphs are
// touched — headings (pStyle), list items (numPr), image blocks (drawing),
// and everything inside a table are left as-is.
function styleContentParagraphs(ooxml: string): string {
  if (!ooxml) return ooxml;
  const IND = '<w:ind w:firstLine="720"/>';
  const JC = '<w:jc w:val="thaiDistribute"/>';
  // Protect tables so cell paragraphs don't get a first-line indent.
  const tables: string[] = [];
  let s = ooxml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (m) => `@@TBL${tables.push(m) - 1}@@`);
  s = s.replace(/<w:p\b([^>]*)>([\s\S]*?)<\/w:p>/g, (full, attrs: string, inner: string) => {
    // H2/H3 subheadings: space above (none below), thaiDistribute, bold, auto
    // (black) color — overriding the template heading style's blue — and the
    // same 16pt body size (overriding the template's larger heading sizes).
    if (/<w:pStyle\b[^>]*w:val="Heading[23]"/.test(inner)) {
      let body = ensureThaiDistribute(headingSpacing(inner));
      body = body.replace(/<w:r\b(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (r) => thaiRun(r, true, true));
      return `<w:p${attrs}>${body}</w:p>`;
    }
    // Bullet / numbered list items: thaiDistribute + Thai-tagged runs, but keep
    // their numPr indent (no first-line indent).
    if (/<w:numPr\b/.test(inner)) {
      if (!/<w:t[\s>]/.test(inner)) return full;
      let body = ensureThaiDistribute(inner);
      body = body.replace(/<w:r\b(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (r) => thaiRun(r));
      return `<w:p${attrs}>${body}</w:p>`;
    }
    if (/<w:pStyle\b/.test(inner) || /<w:drawing\b/.test(inner)) return full;
    if (!/<w:t[\s>]/.test(inner)) return full; // structural/empty paragraph
    // Thai-tag every run so wrapping + font are correct.
    let body = inner.replace(/<w:r\b(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, (r) => thaiRun(r));
    // Set alignment + first-line indent (schema wants <w:ind> before <w:jc>).
    if (/<w:pPr>/.test(body)) {
      body = body.replace(/<w:pPr>([\s\S]*?)<\/w:pPr>/, (_m, ppr: string) => {
        const cleaned = ppr.replace(/<w:jc\b[^>]*\/>/g, "").replace(/<w:ind\b[^>]*\/>/g, "");
        return `<w:pPr>${cleaned}${IND}${JC}</w:pPr>`;
      });
    } else {
      body = `<w:pPr>${IND}${JC}</w:pPr>${body}`;
    }
    return `<w:p${attrs}>${body}</w:p>`;
  });
  return s.replace(/@@TBL(\d+)@@/g, (_m, i) => tables[+i]);
}

const statusText = (s: string, outdated: boolean) =>
  outdated ? "Outdated" : s === "InReview" ? "In Review" : s;

// GET keeps the plain-link behaviour (mermaid stays as code — no browser to
// render it). POST carries the browser-rendered diagram PNGs keyed by chart
// hash, which is what turns mermaid into real diagrams in the output.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await getCurrentUser();
  return buildBoiDocx(params.id, {});
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  await getCurrentUser();
  let images: Record<string, string> = {};
  try {
    const body = (await req.json()) as { images?: Record<string, string> };
    if (body?.images && typeof body.images === "object") images = body.images;
  } catch {
    /* no/invalid body — export with no diagrams (mermaid falls back to code) */
  }
  return buildBoiDocx(params.id, images);
}

async function buildBoiDocx(id: string, mermaidImages: Record<string, string>) {
  const data = await getProjectFull(id);
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
    if (doc) {
      // contentToHtml → swap mermaid fences for the browser-rendered PNGs →
      // embed attachment images. The swapped-in <img> is a data URI, so it
      // rides the same html-to-docx image pass as everything else.
      const html = swapMermaidImages(contentToHtml(doc.content), mermaidImages);
      htmlByKey.set(key, await embedImages(html));
    }
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

  const customerLogo = await coverLogoImage(docs);

  const templateData: Record<string, string> = { projectName: project.name };
  // Page break after the revision table so the first content section
  // ("ที่มาและความสำคัญ") always starts at the top of a fresh page.
  templateData.revisionTable =
    styleContentTables(await renderSimpleOoxml(revisionHtml)) +
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  for (const key of SECTION_KEYS) {
    templateData[`body${key}`] = htmlByKey.has(key)
      ? styleContentParagraphs(styleContentTables(merged.bodies.get(key) || "<w:p/>"))
      : NOTE_NO_DOC;
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

  // Seat the customer logo on the cover, beside our own. Done after render (not
  // via a template tag) so it can clone the template's known-good anchored logo
  // drawing and share its paragraph — that keeps the two on the same line.
  if (customerLogo) {
    const name = `customer-logo.${customerLogo.ext}`;
    outZip.file(`word/media/${name}`, customerLogo.data);

    let rels = outZip.file("word/_rels/document.xml.rels")?.asText() || "";
    const nextRid = "rId" + (Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1);
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="${nextRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/></Relationships>`
    );
    outZip.file("word/_rels/document.xml.rels", rels);

    let ct = outZip.file("[Content_Types].xml")?.asText() || "";
    if (!new RegExp(`Extension="${customerLogo.ext}"`, "i").test(ct)) {
      const mime = customerLogo.ext === "jpg" ? "image/jpeg" : customerLogo.ext === "svg" ? "image/svg+xml" : `image/${customerLogo.ext}`;
      ct = ct.replace("</Types>", `<Default Extension="${customerLogo.ext}" ContentType="${mime}"/></Types>`);
      outZip.file("[Content_Types].xml", ct);
    }

    let docXml = outZip.file("word/document.xml")?.asText() || "";
    // The whole run that carries the template cover logo (image1.png), matched
    // without crossing a run boundary; the customer logo is cloned from its
    // drawing and inserted as a sibling run in the same paragraph.
    const runRe = /<w:r\b(?:(?!<\/w:r>)[\s\S])*?<w:drawing\b(?:(?!<\/w:r>)[\s\S])*?name="image1\.png"(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/;
    const runMatch = docXml.match(runRe);
    const drawing = runMatch?.[0].match(/<w:drawing\b[\s\S]*?<\/w:drawing>/)?.[0];
    if (runMatch && drawing) {
      docXml = docXml.replace(runRe, (r) => customerLogoRun(drawing, nextRid, customerLogo.w, customerLogo.h) + r);
      outZip.file("word/document.xml", docXml);
    }
  }

  // Normalise the whole document to single (1.0) line spacing.
  {
    const docXml = outZip.file("word/document.xml")?.asText() || "";
    if (docXml) outZip.file("word/document.xml", repeatTableHeaders(setSingleLineSpacing(docXml)));
  }

  const out: Buffer = outZip.generate({ type: "nodebuffer" });

  // Filename: {exportName || project name}_YYMMDD.docx — date in Thailand time
  // (Asia/Bangkok) so the day rolls over at local midnight. The base keeps
  // spaces/Thai; only filesystem-illegal chars are dropped.
  const bkk = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const yymmdd = `${bkk.year}${bkk.month}${bkk.day}`;
  const rawBase = project.exportName?.trim() || project.name || "project";
  const safeName =
    rawBase.replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ").replace(/\s+/g, " ").trim() || "project";
  const base = `${safeName}_${yymmdd}`;
  // Non-ASCII (Thai) names need filename* (RFC 5987); keep an ASCII fallback too.
  const ascii = base.replace(/[^\x20-\x7e]/g, "_");
  return new Response(out as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${ascii}.docx"; filename*=UTF-8''${encodeURIComponent(
        base + ".docx"
      )}`,
      "Cache-Control": "no-store",
    },
  });
}

function boiTemplatePath(): string {
  return path.join(process.cwd(), "public", "boi", "SRS_Template.tagged.docx");
}
