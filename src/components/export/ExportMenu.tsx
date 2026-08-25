"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { canvasToBlob, copyImageBlob, copyTextToClipboard, downloadBlob, downloadText, rowsToCSV } from "@/lib/export";

type ExportMenuProps = {
  filename: string;
  getRows: () => { columns: string[]; rows: (string | number)[][] };
  /** Returns null when there's genuinely nothing to rasterize yet (e.g. chart still loading). */
  getImage: () => Promise<HTMLCanvasElement | null>;
  className?: string;
};

const IMAGE_FORMATS = [
  { label: "Copy as PNG", mime: "image/png", ext: "png" },
  { label: "Copy as JPG", mime: "image/jpeg", ext: "jpg" },
  { label: "Copy as JPEG", mime: "image/jpeg", ext: "jpeg" },
];

/** The ⋮ menu on every table/chart card: copy or download the underlying rows as CSV, or copy a
 * rasterized image of it in a chosen format (falls back to a download if the clipboard image
 * write itself throws — some browsers/permissions contexts refuse it outright). */
export function ExportMenu({ filename, getRows, getImage, className = "" }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setImageOpen(false);
  }
  useOnClickOutside(rootRef, open, close);

  function flash(message: string) {
    setStatus(message);
    setTimeout(() => setStatus(null), 1400);
  }

  async function handleCopyRaw() {
    const { columns, rows } = getRows();
    await copyTextToClipboard(rowsToCSV(columns, rows));
    flash("Copied");
  }

  function handleDownloadRaw() {
    const { columns, rows } = getRows();
    downloadText(`${filename}.csv`, rowsToCSV(columns, rows));
    close();
  }

  async function handleCopyImage(mime: string, ext: string) {
    const canvas = await getImage();
    if (!canvas) return flash("Nothing to export yet");
    const blob = await canvasToBlob(canvas, mime);
    if (!blob) return flash("Export failed");
    try {
      await copyImageBlob(blob);
      flash("Copied");
    } catch {
      downloadBlob(`${filename}.${ext}`, blob);
      flash("Downloaded");
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Export options"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--f1-line)] py-1 text-sm shadow-xl backdrop-blur-md"
            style={{ backgroundColor: "rgba(24, 24, 27, 0.92)" }}
          >
            {status ? (
              <p className="px-4 py-2.5 text-neutral-300">{status}</p>
            ) : (
              <>
                <button
                  onClick={handleCopyRaw}
                  className="block w-full px-4 py-2 text-left text-neutral-300 transition hover:bg-white/5 hover:text-white"
                >
                  Copy raw data
                </button>
                <button
                  onClick={handleDownloadRaw}
                  className="block w-full px-4 py-2 text-left text-neutral-300 transition hover:bg-white/5 hover:text-white"
                >
                  Download raw data
                </button>
                <button
                  onClick={() => setImageOpen((v) => !v)}
                  aria-expanded={imageOpen}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-neutral-300 transition hover:bg-white/5 hover:text-white"
                >
                  Copy as image
                  <span className={`text-xs transition-transform ${imageOpen ? "rotate-90" : ""}`}>›</span>
                </button>
                <AnimatePresence>
                  {imageOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden border-t border-[var(--f1-line)]"
                    >
                      {IMAGE_FORMATS.map((f) => (
                        <button
                          key={f.label}
                          onClick={() => handleCopyImage(f.mime, f.ext)}
                          className="block w-full px-6 py-2 text-left text-neutral-400 transition hover:bg-white/5 hover:text-white"
                        >
                          {f.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
