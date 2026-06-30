"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Upload, Trash2, FileText, ImageIcon, FileSpreadsheet, File as FileIcon } from "lucide-react";
import { deleteAttachment } from "@/lib/actions";
import { humanSize } from "@/lib/utils";

type Att = { id: string; filename: string; mime: string; size: number };

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return <ImageIcon size={15} />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet size={15} />;
  if (mime === "application/pdf" || mime.includes("word") || mime.startsWith("text/"))
    return <FileText size={15} />;
  return <FileIcon size={15} />;
}

export function AttachmentPanel({
  docId,
  attachments,
  canEdit,
}: {
  docId: string;
  attachments: Att[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/documents/${docId}/attachments`, { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(id: string) {
    if (!confirm("Delete this attachment?")) return;
    startTransition(async () => {
      await deleteAttachment(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Paperclip size={13} /> Attachments {attachments.length > 0 && `(${attachments.length})`}
        </div>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={onPick}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
            >
              <Upload size={13} /> {uploading ? "Uploading…" : "Upload"}
            </button>
          </>
        )}
      </div>

      {error && <p className="mb-2 text-[11px] text-red-400">{error}</p>}

      {attachments.length === 0 ? (
        <p className="text-[11px] text-muted">No attachments. Max 10 MB · images, PDF, Word, Excel, CSV, zip.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-2">
              {a.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/attachments/${a.id}`}
                  alt={a.filename}
                  className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-surface text-muted">
                  {iconFor(a.mime)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm hover:text-brand"
                >
                  {a.filename}
                </a>
                <div className="text-[11px] text-muted">{humanSize(a.size)}</div>
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(a.id)}
                  disabled={isPending}
                  title="Delete attachment"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:border-red-500/40 hover:text-red-400 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
