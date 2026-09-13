"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

export const IMAGE_TYPES: Record<string, true> = { "image/png": true, "image/jpeg": true, "image/webp": true };

/** Returns an error string, or null when the file is acceptable. Exported for its own test - the
 * limits have to match the Storage buckets' own `file_size_limit`, and a mismatch here means the
 * user only finds out after the community has already been created. */
export function validateImage(file: File, maxBytes: number): string | null {
  if (!IMAGE_TYPES[file.type]) return "PNG, JPEG, or WEBP only.";
  if (file.size > maxBytes) return `Image must be under ${formatBytes(maxBytes)}.`;
  return null;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${Math.round(bytes / (1024 * 1024))}MB` : `${Math.round(bytes / 1024)}KB`;
}

/**
 * Click-or-drop image staging for the create flow. Deliberately local-only: it holds a File plus a
 * preview URL and hands both to the caller, because the avatar/banner upload routes are keyed by a
 * community id that doesn't exist yet at this point in the flow.
 *
 * Kept compact rather than the usual full-width dashed rectangle - the explicit ask was "do not
 * make the upload area unnecessarily huge", and once an image is chosen the preview *is* the
 * control.
 */
export function ImageDropzone({
  file,
  onPick,
  onClear,
  maxBytes,
  label,
  hint,
  /** Tailwind aspect/height classes for the preview surface - a 16:5 banner and a round avatar want
   * very different shapes out of the same component. */
  surfaceClassName,
  rounded = false,
}: {
  file: File | null;
  onPick: (file: File) => void;
  onClear: () => void;
  maxBytes: number;
  label: string;
  hint: string;
  surfaceClassName: string;
  rounded?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  // Derived, not state: createObjectURL is cheap and synchronous, so the URL can be computed during
  // render and only its *revocation* needs an effect. (Doing both in an effect meant a setState in
  // an effect body, which cascades an extra render for every file pick.) Picking five images in a
  // row still strands nothing - each URL is revoked as soon as it stops being current.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    const message = validateImage(candidate, maxBytes);
    if (message) {
      setError(message);
      return;
    }
    setError("");
    onPick(candidate);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative overflow-hidden border border-dashed bg-black/20 transition ${surfaceClassName} ${
          rounded ? "rounded-full" : "rounded-lg"
        } ${dragging ? "border-[var(--f1-red)] bg-[var(--f1-red)]/5" : "border-[var(--f1-line)]"}`}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={preview ? `Replace ${label}` : `Upload ${label}`}
          className="block h-full w-full"
        >
          {preview ? (
            // Plain <img>: a local blob: URL is exactly what next/image can't process (no remote
            // host, no static import), so there is nothing for the optimizer to do here.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] leading-tight text-neutral-500">
              {dragging ? "Drop to upload" : label}
            </span>
          )}
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px]">
        <button type="button" onClick={() => inputRef.current?.click()} className="font-medium text-neutral-300 transition hover:text-white">
          {preview ? "Replace" : "Upload"}
        </button>
        {preview && (
          <button
            type="button"
            onClick={() => {
              setError("");
              onClear();
            }}
            className="text-neutral-500 transition hover:text-neutral-300"
          >
            Remove
          </button>
        )}
        <span className="text-neutral-600">{hint}</span>
      </div>
      {error && <p className="mt-1 text-[11px] text-[var(--f1-red)]">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          // Reset first, so picking the same file twice in a row still fires onChange.
          e.target.value = "";
          accept(picked);
        }}
      />
    </div>
  );
}
