"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
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
  const closeLightbox = useCallback(() => setOpen(false), []);

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
      {/* Named here because a post's image has no description to give it: there is no alt-text
          field in the composer yet (audit CR-28). The image inside is then decorative to the button. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!loaded}
        aria-label="Open the attached image full size"
        className="relative mt-2 block min-h-[10rem] w-full overflow-hidden rounded-lg border border-[var(--f1-line)] bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
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
      {open && <Lightbox url={url} onClose={closeLightbox} />}
    </>
  );
}

/** The full-size view: a modal dialog (it had no role, Escape or focus handling, audit UI-30) with a
 * close button. A click anywhere still closes it; focus goes back to the image that opened it. */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(panelRef, true, onClose);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Attached image"
      onClick={onClose}
      className="fixed inset-0 z-[200] flex cursor-zoom-out items-center justify-center bg-black/85 p-6"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-surface-3 text-primary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <X aria-hidden size={20} strokeWidth={1.75} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Attached image, full size" className="max-h-full max-w-full rounded-lg object-contain" />
    </div>,
    document.body,
  );
}
