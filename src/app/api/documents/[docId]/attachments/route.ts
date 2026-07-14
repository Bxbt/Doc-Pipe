import { NextResponse } from "next/server";
import { writeFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { getCurrentUser, canEdit } from "@/lib/auth";
import {
  ensureUploadDir,
  randomStoredName,
  storedPath,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME,
} from "@/lib/storage";

export async function POST(req: Request, props: { params: Promise<{ docId: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!canEdit(user)) {
    return NextResponse.json({ error: "Editor access required." }, { status: 403 });
  }

  const doc = await prisma.document.findUnique({ where: { id: params.docId } });
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File exceeds 10 MB limit." }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `File type not allowed (${file.type || "unknown"}).` }, { status: 415 });
  }

  const storedName = randomStoredName(file.name);
  await ensureUploadDir();
  await writeFile(storedPath(storedName), Buffer.from(await file.arrayBuffer()));

  const attachment = await prisma.attachment.create({
    data: {
      documentId: doc.id,
      filename: file.name,
      mime: file.type,
      size: file.size,
      storedName,
      uploadedById: user.id,
    },
  });
  await prisma.activity.create({
    data: { projectId: doc.projectId, userId: user.id, action: "added_attachment", detail: file.name },
  });

  return NextResponse.json({
    id: attachment.id,
    filename: attachment.filename,
    mime: attachment.mime,
    size: attachment.size,
  });
}
