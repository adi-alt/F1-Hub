"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { attachmentBadge, attachmentKind, attachmentMetaLine, displayName, type AttachmentKind } from "./attachmentMeta";

export type AttachmentView = {
  url: string;
  name: string | null;
  mime: string | null;
  size: number | null;
  thumbUrl: string | null;
  pages: number | null;
};

/**
 * One attachment, one visual system.
 *
 * The same component renders the composer's pre-post preview and the feed card, so what someone
 * sees before publishing is literally what publishes. Type only changes what fills the preview
 * area - never the surface, the radius, the metadata line or the actions - which is what stops
 * every file type looking like a different product.
 *
 * The filename shown is always the ORIGINAL name captured at upload. The storage path is a random
 * UUID and is never used for display; a post from before metadata existed shows its type instead
 * ("PDF document"), which is honest, rather than resurrecting the UUID.
 */
export function PostAttachment({ attachment, onRemove }: { attachment: AttachmentView; onRemove?: () => void }) {
  const kind = attachmentKind(attachment.mime, attachment.name ?? attachment.url);
  const badge = attachmentBadge(kind, attachment.name);
  const name = displayName(attachment.name, kind);
  const meta = attachmentMetaLine({ pages: attachment.pages, size: attachment.size, badge });
  const [lightbox, setLightbox] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);

  // An image IS its own preview - a caption row under it would just repeat what you can see.
  if (kind === "image" && !mediaFailed) {
    return (
      <>
        {/* The remove control is a SIBLING of the open-lightbox button, never nested inside it:
            a button within a button is invalid markup the browser silently unnests, which breaks
            hydration and makes the inner control unclickable. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="relative mt-2 overflow-hidden rounded-lg border border-white/[0.07] bg-black/20"
        >
          <button type="button" onClick={() => setLightbox(true)} aria-label={`View ${name} full size`} className="block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Storage URL, not a known-domain asset next/image can optimize */}
            <img src={attachment.url} alt={name} loading="lazy" onError={() => setMediaFailed(true)} className="max-h-[420px] w-full object-contain" />
          </button>
          {onRemove && <RemoveButton onRemove={onRemove} />}
        </motion.div>
        {lightbox && <Lightbox url={attachment.url} name={name} onClose={() => setLightbox(false)} />}
      </>
    );
  }

  if (kind === "video" && !mediaFailed) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="relative mt-2 overflow-hidden rounded-lg border border-white/[0.07] bg-black">
        {/* preload="metadata" and no autoplay: a feed must not start playing at someone, and must
            not pull whole videos down to render a card. */}
        <video src={attachment.url} controls preload="metadata" poster={attachment.thumbUrl ?? undefined} onError={() => setMediaFailed(true)} className="max-h-[420px] w-full" />
        <MetaRow badge={badge} name={name} meta={meta} url={attachment.url} downloadName={attachment.name} />
        {onRemove && <RemoveButton onRemove={onRemove} />}
      </motion.div>
    );
  }

  if (kind === "audio" && !mediaFailed) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="relative mt-2 rounded-lg border border-white/[0.07] bg-black/20 p-2.5">
        <audio src={attachment.url} controls preload="metadata" onError={() => setMediaFailed(true)} className="h-9 w-full" />
        <p className="mt-1.5 truncate text-[13px] font-medium text-neutral-200">{name}</p>
        <p className="text-[11.5px] text-neutral-500">{meta}</p>
        {onRemove && <RemoveButton onRemove={onRemove} />}
      </motion.div>
    );
  }

  // Everything else: a document card. When a first-page image was generated at upload it fills
  // the preview area; otherwise the card is just the typed row, which is still a real answer to
  // "what is this" rather than a broken image slot.
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="relative mt-2 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
      {attachment.thumbUrl && !mediaFailed && (
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="block border-b border-white/[0.06] bg-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated preview on arbitrary Storage URL */}
          <img src={attachment.thumbUrl} alt={`First page of ${name}`} loading="lazy" onError={() => setMediaFailed(true)} className="max-h-[260px] w-full object-contain" />
        </a>
      )}
      <MetaRow badge={badge} name={name} meta={meta} url={attachment.url} downloadName={attachment.name} kind={kind} />
      {onRemove && <RemoveButton onRemove={onRemove} />}
    </motion.div>
  );
}

function MetaRow({ badge, name, meta, url, downloadName, kind }: { badge: string; name: string; meta: string; url: string; downloadName: string | null; kind?: AttachmentKind }) {
  return (
    // A row, not a link wrapping a link: "open" and "download" are two separate anchors side by
    // side. Nesting them would be invalid markup, and the browser's own unnesting is what turns a
    // download button into a second copy of the open link.
    <div className="flex items-center gap-2.5 px-2.5 py-2 transition hover:bg-white/[0.03]">
      <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[9px] font-bold tracking-wide ${TONE[kind ?? "file"]}`}>
        {badge}
      </span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]">
        {/* Two lines then ellipsis: a real filename is often long, and truncating it to one line
            hides the part that identifies it. line-clamp keeps it bounded either way. */}
        <span className="line-clamp-2 break-all text-[13.5px] font-medium leading-snug text-neutral-100">{name}</span>
        <span className="mt-0.5 block text-[11.5px] text-neutral-500">{meta}</span>
      </a>
      {/* download carries the ORIGINAL name, so the saved file is never the storage UUID. */}
      <a
        href={url}
        download={downloadName ?? undefined}
        aria-label={`Download ${name}`}
        title={`Download ${name}`}
        className="shrink-0 rounded-md p-1.5 text-neutral-500 transition hover:bg-white/[0.06] hover:text-white"
      >
        <DownloadIcon />
      </a>
    </div>
  );
}

const TONE: Record<AttachmentKind, string> = {
  pdf: "bg-[var(--f1-red)]/[0.14] text-[var(--f1-red)]",
  sheet: "bg-emerald-500/[0.14] text-emerald-400",
  doc: "bg-sky-500/[0.14] text-sky-400",
  slides: "bg-amber-500/[0.14] text-amber-400",
  text: "bg-white/[0.06] text-neutral-300",
  code: "bg-violet-500/[0.14] text-violet-400",
  archive: "bg-white/[0.06] text-neutral-300",
  image: "bg-white/[0.06] text-neutral-300",
  video: "bg-white/[0.06] text-neutral-300",
  audio: "bg-white/[0.06] text-neutral-300",
  file: "bg-white/[0.06] text-neutral-300",
};

function RemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }}
      aria-label="Remove attachment"
      title="Remove attachment"
      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/80 transition hover:bg-black/90 hover:text-white"
    >
      <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" aria-hidden>
        <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Lightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary Storage URL */}
        <img src={url} alt={name} className="max-h-full max-w-full rounded-lg object-contain" />
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <path d="M8 2.5v7m0 0L5.2 6.7M8 9.5l2.8-2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.8 11.5v1.2a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8v-1.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
