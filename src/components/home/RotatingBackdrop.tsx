"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const ROTATE_MS = 30_000;

/** The upcoming-race banner's backdrop: crossfades through real photos of this circuit (see
 * lib/personalization.ts's getRecentCircuitPhotos — last ~10 seasons, rolling with the current
 * year) every 30s. All frames are mounted and stacked (`fill`, absolutely positioned by Next's
 * `fill` prop within the banner's own `relative` container); only the active one is opaque, so the
 * opacity transition is a real crossfade rather than a hard cut. Fine at this scale (at most ~10
 * photos) — no need for lazy-swapping `src` on one <Image>, which would lose the fade entirely.
 * Renders nothing if there's no photo at all yet (a track with no backfilled photo — see
 * `photos` being empty in that case, not this component's problem to fall back further). */
export function RotatingBackdrop({ photos }: { photos: string[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (photos.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % photos.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [photos.length]);

  return (
    <>
      {photos.map((url, i) => (
        <Image
          key={url}
          src={url}
          alt=""
          fill
          sizes="100vw"
          priority={i === 0}
          className={`object-cover transition-opacity duration-1000 ${i === index ? "opacity-20" : "opacity-0"}`}
        />
      ))}
    </>
  );
}
