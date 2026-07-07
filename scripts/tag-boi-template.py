#!/usr/bin/env python3
"""Turn the BOI SRS Word template into a docxtemplater template.

Input : public/boi/SRS_Template.docx  (the original, as provided)
Output: public/boi/SRS_Template.tagged.docx

Transformations (keeps every other part — styles, header/logo, footer, theme,
media, section headings — untouched):
  - cover "Title" paragraph        -> {projectName}
  - Document Revision History table -> {@revisionTable}
  - each mapped section's body      -> {@body<KEY>}   (heading kept)

Commercial/boilerplate sections in KEEP_TEMPLATE are left exactly as the
template has them (their standard tables are better than generated content).

Run:  python3 scripts/tag-boi-template.py
Requires: lxml
"""
import os
import zipfile
from lxml import etree

SRC = "public/boi/SRS_Template.docx"
DST = "public/boi/SRS_Template.tagged.docx"
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def q(tag):
    return f"{{{W}}}{tag}"


# Heading text (as it appears in the template) -> BOI doc-type key.
SECTION_MAP = {
    "ที่มาและความสำคัญ (Rationale)": "RATIONALE",
    "ขอบเขตของการพัฒนา (Scope of Work)": "SCOPE_OF_WORK",
    "ความต้องการเชิงฟังก์ชัน (Functional Requirements)": "FUNCTIONAL_REQUIREMENTS",
    "ความต้องการเชิงไม่ใช่ฟังก์ชัน (Non-Functional Requirements)": "NON_FUNCTIONAL_REQUIREMENTS",
    "สถาปัตยกรรมระบบ (System Architecture)": "SYSTEM_ARCHITECTURE",
    "โมเดลข้อมูล (Data Model)": "DATA_MODEL",
    "ความปลอดภัยของระบบ (Security Requirements)": "SECURITY_REQUIREMENTS",
    "การเชื่อมต่อภายนอก (External Interface Requirements)": "EXTERNAL_INTERFACE_REQUIREMENTS",
    "Process Flow & System Diagram": "PROCESS_FLOW_SYSTEM_DIAGRAM",
    "Prototype (ตัวอย่างหน้าจอระบบ)": "PROTOTYPE",
    "Software ที่ใช้ในการพัฒนาระบบงาน": "SOFTWARE",
    "ทีมพัฒนา (Developer Team)": "DEVELOPER_TEAM",
    "ระยะเวลาดำเนินการ (Timeline)": "TIMELINE",
    "เงื่อนไขการชำระเงิน (Payment Method)": "PAYMENT_METHOD",
    "ข้อตกลงซอฟต์แวร์ (Software Agreement)": "SOFTWARE_AGREEMENT",
    "ลายมือชื่อ (Signatures)": "SIGNATURES",
}

# Sections whose template boilerplate we keep as-is (not filled from Doc-Pipe).
KEEP_TEMPLATE = {"PAYMENT_METHOD", "SOFTWARE_AGREEMENT", "SIGNATURES"}


def text_of(p):
    return "".join(t.text or "" for t in p.iter(q("t")))


def is_h1(el):
    if el.tag != q("p"):
        return False
    ppr = el.find(q("pPr"))
    if ppr is None:
        return False
    st = ppr.find(q("pStyle"))
    return st is not None and st.get(q("val")) == "Heading1"


def placeholder(tag):
    p = etree.Element(q("p"))
    r = etree.SubElement(p, q("r"))
    etree.SubElement(r, q("t")).text = tag
    return p


def main():
    zin = zipfile.ZipFile(SRC)
    root = etree.fromstring(zin.read("word/document.xml"))
    body = root.find(q("body"))

    # cover
    for p in body.findall(q("p")):
        if text_of(p).strip() == "Title":
            runs = p.findall(q("r"))
            for r in runs[1:]:
                p.remove(r)
            if runs:
                for t in runs[0].findall(q("t")):
                    runs[0].remove(t)
                etree.SubElement(runs[0], q("t")).text = "{projectName}"
            break

    children = list(body)
    new = []
    i, n = 0, len(children)
    filled = []
    while i < n:
        ch = children[i]
        if is_h1(ch) and "Document Revision History" in text_of(ch):
            new.append(ch)
            new.append(placeholder("{@revisionTable}"))
            i += 1
            while i < n and not is_h1(children[i]) and children[i].tag != q("sectPr"):
                i += 1
            continue
        key = SECTION_MAP.get(text_of(ch).strip()) if is_h1(ch) else None
        if key and key not in KEEP_TEMPLATE:
            new.append(ch)
            new.append(placeholder("{@body" + key + "}"))
            filled.append(key)
            i += 1
            while i < n and not is_h1(children[i]) and children[i].tag != q("sectPr"):
                i += 1
            continue
        new.append(ch)
        i += 1

    for ch in children:
        body.remove(ch)
    for ch in new:
        body.append(ch)

    out = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    tmp = DST + ".tmp"
    zout = zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED)
    for item in zin.namelist():
        zout.writestr(item, out if item == "word/document.xml" else zin.read(item))
    zout.close()
    zin.close()
    os.replace(tmp, DST)
    print(f"tagged -> {DST}")
    print(f"filled sections ({len(filled)}): {filled}")
    print(f"kept template boilerplate: {sorted(KEEP_TEMPLATE)}")


if __name__ == "__main__":
    main()
