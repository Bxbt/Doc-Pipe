import { getCurrentUser } from "@/lib/auth";
import { getProjectFull } from "@/lib/queries";
import { extractMermaidCharts } from "@/lib/mermaid-export";
import { contentToHtml } from "@/lib/boi-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every distinct mermaid chart across the project's documents, deduped by hash.
// The browser renders each to a PNG and posts them back to the docx-boi export,
// which is the only way a diagram (not raw code) reaches the Word file.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await getCurrentUser();

  const data = await getProjectFull(params.id);
  if (!data) return new Response("Not found", { status: 404 });

  const seen = new Map<string, string>();
  for (const doc of data.project.documents) {
    for (const c of extractMermaidCharts(contentToHtml(doc.content))) {
      if (!seen.has(c.hash)) seen.set(c.hash, c.code);
    }
  }

  return Response.json({ charts: [...seen].map(([hash, code]) => ({ hash, code })) });
}
