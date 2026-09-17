"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { fileNameFromUrl, mediaKind } from "@/lib/mediaKind";

const DOC_ICON: Record<string, string> = { pdf: "📄", doc: "📄", docx: "📄", xls: "📊", xlsx: "📊" };

/** One attachment per post - image, video, or a document (see mediaKind.ts). Images/GIFs get the
 * existing contain + click-to-enlarge lightbox; video gets a real <video controls> player, never
 * autoplaying; a document (PDF/Word/Excel - no browser can preview those inline reliably) gets a
 * compact file card with a real download link instead of pretending to preview it. */
export function PostMedia({ url }: { url: string }) {
  const kind = mediaKind(url);
  const [open, setOpen] = useState(false);
  // Declared unconditionally (before the video/document early returns) even though only the image
  // branch below reads them - conditionally calling a hook after an early return is exactly what
  // React's rules of hooks forbid.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (kind === "video") {
    return (
      <video controls preload="metadata" className="mt-2 max-h-[420px] w-full rounded-lg border border-[var(--f1-line)] bg-black">
        <source src={url} />
      </video>
    );
  }

  if (kind === "document") {
    const name = fileNameFromUrl(url);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex items-center gap-2.5 rounded-lg border border-[var(--f1-line)] bg-black/20 p-2.5 text-sm text-neutral-300 transition hover:border-white/20 hover:text-white"
      >
        <span className="text-xl" aria-hidden>
          {DOC_ICON[ext] ?? "📎"}
        </span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span className="shrink-0 text-xs text-neutral-500">Download</span>
      </a>
    );
  }

  if (failed) {
    return <div className="mt-2 flex h-40 w-full items-center justify-center rounded-lg border border-[var(--f1-line)] bg-white/[0.02] text-xs text-neutral-600">Image unavailable</div>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={!loaded} className="relative mt-2 block min-h-[10rem] w-full overflow-hidden rounded-lg border border-[var(--f1-line)] bg-black/20">
        {/* No stored width/height for an arbitrary upload, so this can't reserve its EXACT final
            box - but a real minimum height (above) plus this shimmer means the space is never
            just empty/collapsed while the image decodes, and the fade-in (below) means it never
            pops in abruptly either. */}
        {!loaded && <span aria-hidden className="skeleton-shimmer absolute inset-0 bg-white/[0.04]" />}
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Storage URLs, not a known-domain asset next/image can optimize */}
        <img
          src={url}
          alt=""
          className={`max-h-[420px] w-full object-contain transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </button>
      {open &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[200] flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            </motion.div>
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
