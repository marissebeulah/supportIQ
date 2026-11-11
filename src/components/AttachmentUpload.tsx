import { useRef, useState } from "react";
import { FileText, LoaderCircle, Paperclip, X } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import { fileSize, isImage } from "../lib/format";
import type { Attachment } from "../lib/types";

export const ALLOWED_UPLOADS = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

export async function uploadAttachmentFile(file: File): Promise<Attachment> {
  if (!ALLOWED_UPLOADS.includes(file.type)) {
    throw new Error("Only PNG, JPEG, WebP, GIF, and PDF files are supported.");
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error(`"${file.name}" is over the 5 MB limit.`);
  }
  const response = await api.upload<{ attachment: Attachment }>("/api/uploads", file);
  return response.attachment;
}

export function AttachmentUpload({
  value,
  onChange,
  max = 5,
  disabled = false,
}: {
  value: Attachment[];
  onChange: (next: Attachment[]) => void;
  max?: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = (id: number) => {
    onChange(value.filter((attachment) => attachment.id !== id));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const remaining = Math.max(0, max - value.length);
    if (remaining === 0) {
      setError(`You can attach up to ${max} files.`);
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    const uploaded: Attachment[] = [];
    setUploading(true);
    try {
      for (const file of selected) {
        try {
          uploaded.push(await uploadAttachmentFile(file));
        } catch (fileError) {
          setError(errorMessage(fileError));
          break;
        }
      }
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploading(false);
    }
    if (uploaded.length) onChange([...value, ...uploaded]);
    if (inputRef.current) inputRef.current.value = "";
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  };

  return (
    <div className="field">
      <span className="label">
        Screenshots &amp; files <span className="muted small">optional</span>
      </span>
      <div className="attachment-row">
        <label className={`upload-btn ${disabled || value.length >= max ? "is-disabled" : ""}`.trim()}>
          {uploading ? <LoaderCircle size={14} className="spin" /> : <Paperclip size={14} />}
          {uploading ? "Uploading…" : "Attach a file"}
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_UPLOADS.join(",")}
            multiple
            disabled={disabled || uploading || value.length >= max}
            onChange={(event) => void handleFiles(event.target.files)}
          />
        </label>
        {value.map((attachment) => (
          <span className="attach-chip" key={attachment.id} title={attachment.filename}>
            {isImage(attachment.mime) ? <Paperclip size={13} /> : <FileText size={13} />}
            <span>{attachment.filename}</span>
            <span className="muted">{fileSize(attachment.size)}</span>
            <button type="button" onClick={() => remove(attachment.id)} aria-label={`Remove ${attachment.filename}`}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      {error ? (
        <p className="error-text">{error}</p>
      ) : (
        <p className="hint">PNG, JPEG, WebP, GIF, or PDF up to 5 MB. Only you and the IT team can see them.</p>
      )}
    </div>
  );
}
