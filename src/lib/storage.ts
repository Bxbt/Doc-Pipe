import { mkdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomBytes } from "node:crypto";

// Where uploaded files live. In production set UPLOAD_DIR=/data/uploads (a
// persistent volume). With Postgres the DB no longer implies a filesystem path,
// so uploads must be configured explicitly; dev falls back to ./data/uploads.
export function uploadDir(): string {
  return process.env.UPLOAD_DIR ?? join(process.cwd(), "data", "uploads");
}

export async function ensureUploadDir(): Promise<string> {
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export function storedPath(storedName: string): string {
  return join(uploadDir(), storedName);
}

export function randomStoredName(originalName: string): string {
  const ext = extname(originalName).slice(0, 12); // keep extension, bounded
  return randomBytes(16).toString("hex") + ext;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

// Allowlist — images, PDF, Office docs, CSV/text, zip. (SVG/HTML excluded for safety.)
export const ALLOWED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/zip",
]);

// Files served inline (previewable); everything else downloads as an attachment.
export function isInline(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}
