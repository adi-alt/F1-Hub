"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import type { RacePhoto } from "@/lib/racePhotos";

/** "Photo: Yu Chu Chin, CC BY-SA 4.0": the photographer links to the Commons file page, the licence to its deed. */
function Credit({ photo }: { photo: RacePhoto }) {
  return (
    <figcaption className="mt-2 text-caption text-secondary">
      Photo:{" "}
      <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-control text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
        {photo.photographer}
      </a>
      ,{" "}
      <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer license" className="rounded-control underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
        {photo.license}
      </a>
    </figcaption>
  );
}

/**
 * Up to four approved photos of the race weekend (pipeline/race_photos.py, /admin/race-photos), loaded straight
 * from Wikimedia: the 500px rendition here and the 1280px one when opened. Each keeps its own aspect ratio,
 * uncropped and unedited, with its credit under it. Renders nothing without photos: there is no stand-in image.
 */
export function RacePhotoGallery({ photos }: { photos: RacePhoto[] }) {
  const [open, setOpen] = useState<RacePhoto | null>(null);
  if (photos.length === 0) return null;
  return (
    <>
      <div className={`grid grid-cols-1 items-start gap-6 ${photos.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {photos.map((p) => (
          <figure key={p.id} className="min-w-0">
            <button
              type="button"
              onClick={() => setOpen(p)}
              className="block w-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              aria-label={`Open larger: ${p.altText}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Wikimedia's own 500px thumbnail, loaded from upload.wikimedia.org on purpose: no Vercel optimisation, no Supabase Storage */}
              <img
                src={p.thumbnailUrl}
                alt={p.altText}
                width={p.width}
                height={p.height}
                loading="lazy"
                decoding="async"
                className="h-auto w-full rounded-card bg-surface-2"
              />
            </button>
            <Credit photo={p} />
          </figure>
        ))}
      </div>
      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open?.altText ?? "Photo"} size="lg">
        {open && (
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element -- Wikimedia's own 1280px rendition, loaded from upload.wikimedia.org */}
            <img src={open.imageUrl} alt={open.altText} width={open.width} height={open.height} decoding="async" className="h-auto w-full rounded-control bg-surface-2" />
            <Credit photo={open} />
            <a
              href={open.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 rounded-control text-body-sm text-secondary underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              View on Wikimedia Commons <Icon icon={ExternalLink} size={16} />
            </a>
          </figure>
        )}
      </Dialog>
    </>
  );
}
