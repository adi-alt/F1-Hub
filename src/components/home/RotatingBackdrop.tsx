"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const ROTATE_MS = 30_000;

/** The homepage's own backdrop (see page.tsx — mounted once, behind the whole page, inside a
 * fixed-height band that fades into the page's flat background color by its own bottom edge, not
 * scoped to any one card): crossfades through real photos of the upcoming race's circuit (see
 * lib/personalization.ts's getRecentCircuitPhotos — last ~10 seasons, rolling with the current
 * year, widened to the circuit's full history when that's too sparse to rotate through) every
 * 30s. All frames are mounted and stacked (`fill`, absolutely positioned within the page's own
 * `relative` band); only the active one is opaque, so the opacity transition is a real crossfade
 * rather than a hard cut. Fine at this scale (at most ~10-15 photos) — no need for lazy-swapping
 * `src` on one <Image>, which would lose the fade entirely. Renders nothing if there's no photo at
 * all yet (a track with no backfilled photo — see `photos` being empty in that case). */
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
          className={`object-cover transition-opacity duration-1000 ${i === index ? "opacity-40" : "opacity-0"}`}
        />
      ))}
    </>
  );
}
