"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";

// Mermaid can only be laid out in a browser, so the Word (BOI) export renders
// every diagram here first: fetch the chart sources, rasterize each to a PNG,
// then POST the map to the export route (which swaps each fenced chart for its
// image). Without this the diagrams would arrive as raw code.
let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;
function loadMermaid() {
  if (!mermaidPromise) mermaidPromise = import("mermaid").then((m) => m.default);
  return mermaidPromise;
}

// Rasterize a mermaid SVG to a white-background PNG data URI. Word embeds a
// raster far more reliably than SVG, and the white matte matches the page.
async function svgToPng(svg: string): Promise<string> {
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const w = Math.max(1, Math.ceil(vb ? +vb[1] : 800));
  const h = Math.max(1, Math.ceil(vb ? +vb[2] : 600));
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.width = w;
    img.height = h;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg load failed"));
      img.src = url;
    });
    const scale = 2; // render at 2× for a crisp diagram in print
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function WordBoiExport({ projectId }: { projectId: string }) {
  const [busy, setBusy] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      const base = `/projects/${projectId}/export/docx-boi`;

      // 1. Which diagrams does the document set contain?
      const charts: { hash: string; code: string }[] = await fetch(`${base}/charts`)
        .then((r) => (r.ok ? r.json() : { charts: [] }))
        .then((j) => j.charts ?? [])
        .catch(() => []);

      // 2. Render each to a PNG (a chart that fails is simply left as code).
      const images: Record<string, string> = {};
      if (charts.length) {
        const mermaid = await loadMermaid();
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
        for (const c of charts) {
          try {
            const { svg } = await mermaid.render("exp-" + c.hash, c.code);
            images[c.hash] = await svgToPng(svg);
          } catch {
            /* leave this diagram as code */
          }
        }
      }

      // 3. Build the .docx with the rendered diagrams and download it.
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      if (!res.ok) throw new Error(`export failed (${res.status})`);
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] || "project_BOI_SRS.docx";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-brand bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/20 disabled:opacity-60"
      title="Export using the real BOI SRS Word template (renders mermaid diagrams)"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
      {busy ? "Rendering…" : "Word (BOI)"}
    </button>
  );
}
