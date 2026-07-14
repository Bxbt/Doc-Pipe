import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { storedPath, isInline } from "@/lib/storage";

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Access is gated by Cloudflare Access in production; this also ensures a
  // valid app user locally.
  await getCurrentUser();

  const att = await prisma.attachment.findUnique({ where: { id: params.id } });
  if (!att) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(storedPath(att.storedName));
  } catch {
    return new Response("File missing", { status: 404 });
  }

  const disposition = isInline(att.mime) ? "inline" : "attachment";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": att.mime || "application/octet-stream",
      "Content-Length": String(att.size),
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(att.filename)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
