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

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-2 block w-full overflow-hidden rounded-lg border border-[var(--f1-line)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Storage URLs, not a known-domain asset next/image can optimize */}
        <img src={url} alt="" className="max-h-[420px] w-full bg-black/30 object-contain" loading="lazy" />
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
