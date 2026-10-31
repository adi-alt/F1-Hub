"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";

export type LightboxItem = {
  url: string;
  name?: string | null;
};

/**
 * A post image or multi-image gallery at full size in the house Dialog.
 * Supports full carousel navigation (next/previous, keyboard arrows, thumbnail bar, and index counter).
 */
export function ImageLightbox({
  open,
  url,
  name = "Image",
  items,
  initialIndex = 0,
  onClose,
}: {
  open: boolean;
  url?: string;
  name?: string;
  items?: LightboxItem[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const galleryItems: LightboxItem[] =
    items && items.length > 0 ? items : url ? [{ url, name }] : [];

  const [userIndex, setUserIndex] = useState<number | null>(null);
  const [prevInitial, setPrevInitial] = useState(initialIndex);

  if (prevInitial !== initialIndex) {
    setPrevInitial(initialIndex);
    setUserIndex(null);
  }

  const hasMultiple = galleryItems.length > 1;
  const index = userIndex ?? Math.max(0, Math.min(initialIndex, Math.max(0, galleryItems.length - 1)));
  const current = galleryItems[index] ?? galleryItems[0];

  const handlePrev = useCallback(() => {
    setUserIndex((curr) => {
      const active = curr ?? Math.max(0, Math.min(initialIndex, Math.max(0, galleryItems.length - 1)));
      return (active - 1 + galleryItems.length) % galleryItems.length;
    });
  }, [initialIndex, galleryItems.length]);

  const handleNext = useCallback(() => {
    setUserIndex((curr) => {
      const active = curr ?? Math.max(0, Math.min(initialIndex, Math.max(0, galleryItems.length - 1)));
      return (active + 1) % galleryItems.length;
    });
  }, [initialIndex, galleryItems.length]);

  useEffect(() => {
    if (!open || !hasMultiple) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, hasMultiple, handlePrev, handleNext]);

  if (!current) return null;

  const title = hasMultiple
    ? `${current.name || "Photo"} (${index + 1} of ${galleryItems.length})`
    : current.name || name;

  return (
    <Dialog open={open} onClose={onClose} title={title} size="2xl">
      <div className="relative flex flex-col items-center">
        {/* Main image area with Left and Right chevron buttons */}
        <div className="relative flex w-full items-center justify-center min-h-[240px]">
          {hasMultiple && (
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-md transition hover:bg-black/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <ChevronLeft className="size-5" />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Storage URL */}
          <img
            key={current.url}
            src={current.url}
            alt={current.name || "Gallery image"}
            className="mx-auto max-h-[70dvh] max-w-full rounded-card object-contain transition-opacity duration-150"
          />

          {hasMultiple && (
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next image"
              className="absolute right-2 top-1/2 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white/90 backdrop-blur-md transition hover:bg-black/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <ChevronRight className="size-5" />
            </button>
          )}
        </div>

        {/* Bottom thumbnail strip for multiple photos */}
        {hasMultiple && (
          <div className="mt-3 flex max-w-full items-center justify-center gap-2 overflow-x-auto p-1">
            {galleryItems.map((item, idx) => (
              <button
                key={`${item.url}-${idx}`}
                type="button"
                onClick={() => setUserIndex(idx)}
                aria-label={`Go to image ${idx + 1}`}
                className={`relative size-12 shrink-0 overflow-hidden rounded-control border transition ${
                  idx === index ? "border-brand ring-2 ring-brand/40 opacity-100" : "border-white/15 opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
