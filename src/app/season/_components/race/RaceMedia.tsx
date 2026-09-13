"use client";

import Image from "next/image";
import { useState } from "react";
import { MediaSkeleton } from "@/components/ui/Skeletons";

/**
 * The race window's hero image.
 *
 * Every media element on this page reserves its box before the bytes arrive — the skeleton and
 * the image share the same aspect-ratio container, so the image crossfades INTO the space rather
 * than pushing the window's whole contents down when it decodes. That is the difference between a
 * loading state and a layout shift.
 *
 * Renders nothing at all when the round genuinely has no photography (archive rounds, and any
 * round the pipeline hasn't fetched Commons images for yet). An empty grey box would be worse
 * than an absent section, and a stand-in image would be a fabrication.
 */
export function RaceMedia({ photoUrls, raceName }: { photoUrls: string[]; raceName: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = photoUrls[0];

  if (!src || failed) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-md" style={{ aspectRatio: "16 / 7" }}>
      {!loaded && <MediaSkeleton ratio="16 / 7" rounded="rounded-md" className="absolute inset-0 h-full" />}
      <Image
        src={src}
        alt={`${raceName} race photography`}
        fill
        sizes="(max-width: 640px) 100vw, 560px"
        className={`object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        priority={false}
      />
      {/* A soft foot to the image so the metadata below it doesn't sit against a hard edge. */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[var(--background)] to-transparent" />
    </div>
  );
}
