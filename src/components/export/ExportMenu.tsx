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
  { label: "PNG", mime: "image/png", ext: "png" },
  { label: "JPG", mime: "image/jpeg", ext: "jpg" },
  { label: "JPEG", mime: "image/jpeg", ext: "jpeg" },
];

const SUBMENU_WIDTH = 160;

// Same glass treatment as a chart tooltip (chartTheme.ts) / the calendar's own hover tooltip —
// every floating panel on the site reads consistently instead of one being a flat opaque box.
const GLASS_STYLE = {
  backgroundColor: "var(--glass-surface-strong)",
  backdropFilter: "blur(var(--glass-blur))",
  WebkitBackdropFilter: "blur(var(--glass-blur))",
};

type Submenu = "copy-image" | "download-image" | null;

/** The ⋮ menu on every table/chart card: copy or download the underlying rows as CSV, or export a
 * rasterized image in a chosen format via a nested flyout — opened left or right of the main
 * panel depending on which side actually has room in the viewport. */
export function ExportMenu({ filename, getRows, getImage, className = "" }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<Submenu>(null);
  const [submenuSide, setSubmenuSide] = useState<"left" | "right">("right");
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setSubmenu(null);
  }
  useOnClickOutside(rootRef, open, close);

  function flash(message: string) {
    setStatus(message);
    setSubmenu(null);
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

  function toggleSubmenu(which: Exclude<Submenu, null>) {
    if (submenu === which) {
      setSubmenu(null);
      return;
    }
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      const roomRight = window.innerWidth - rect.right;
      const roomLeft = rect.left;
      setSubmenuSide(roomRight >= SUBMENU_WIDTH ? "right" : roomLeft >= SUBMENU_WIDTH ? "left" : roomRight >= roomLeft ? "right" : "left");
    }
    setSubmenu(which);
  }

  async function handleFormat(mime: string, ext: string) {
    const canvas = await getImage();
    if (!canvas) return flash("Nothing to export yet");
    const blob = await canvasToBlob(canvas, mime);
    if (!blob) return flash("Export failed");
    if (submenu === "download-image") {
      downloadBlob(`${filename}.${ext}`, blob);
      return flash("Downloaded");
    }
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
            ref={panelRef}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full z-30 mt-2 w-48 overflow-visible rounded-xl border border-[var(--f1-line)] py-1 text-sm shadow-xl backdrop-blur-md"
            style={GLASS_STYLE}
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
                  onClick={() => toggleSubmenu("copy-image")}
                  aria-expanded={submenu === "copy-image"}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left transition hover:bg-white/5 hover:text-white ${submenu === "copy-image" ? "text-white" : "text-neutral-300"}`}
                >
                  Copy as image <span className="text-xs">{submenuSide === "right" ? "›" : "‹"}</span>
                </button>
                <button
                  onClick={() => toggleSubmenu("download-image")}
                  aria-expanded={submenu === "download-image"}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left transition hover:bg-white/5 hover:text-white ${submenu === "download-image" ? "text-white" : "text-neutral-300"}`}
                >
                  Download image <span className="text-xs">{submenuSide === "right" ? "›" : "‹"}</span>
                </button>
              </>
            )}

            <AnimatePresence>
              {submenu && (
                <motion.div
                  initial={{ opacity: 0, x: submenuSide === "right" ? -6 : 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: submenuSide === "right" ? -6 : 6 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className={`absolute top-0 w-40 overflow-hidden rounded-xl border border-[var(--f1-line)] py-1 text-sm shadow-xl backdrop-blur-md ${
                    submenuSide === "right" ? "left-full ml-2" : "right-full mr-2"
                  }`}
                  style={GLASS_STYLE}
                >
                  {IMAGE_FORMATS.map((f) => (
                    <button
                      key={f.label}
                      onClick={() => handleFormat(f.mime, f.ext)}
                      className="block w-full px-4 py-2 text-left text-neutral-300 transition hover:bg-white/5 hover:text-white"
                    >
                      {f.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
