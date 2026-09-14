"use client";

import Image from "next/image";
import { useState } from "react";
import { MediaSkeleton } from "@/components/ui/Skeletons";

type State = "loading" | "loaded" | "error";

/**
 * Race photography for the event window: a hero image, plus a thumbnail strip when more than one
 * photo is available.
 *
 * Every image goes through the same four states - loading, loaded, error, and none available -
 * and all four occupy the exact same box, so the crossfade never moves anything below it.
 *
 * Most of a season's still-to-run rounds have no photography of their OWN yet - the pipeline only
 * fetches a race weekend's real photos once that weekend has actually been processed, which is
 * most of "many races have no image". Rather than an empty box for every one of those, this falls
 * back to the circuit's own real photography (archive_circuits, backfilled independently of any
 * specific race weekend) and says so with a small label, so a circuit photo is never mistaken for
 * this weekend's own coverage. Nothing here is ever invented: with neither set populated, it's an
 * honest placeholder, not a stock photo of a different venue.
 */
export function RaceMedia({
  photoUrls,
  circuitPhotoUrls,
  raceName,
  circuit,
}: {
  photoUrls: string[];
  circuitPhotoUrls: string[];
  raceName: string;
  circuit: string | null;
}) {
  const [active, setActive] = useState(0);
  // Keyed by URL, not index, so switching thumbnails doesn't inherit the previous image's state.
  const [states, setStates] = useState<Record<string, State>>({});

  const own = photoUrls.filter(Boolean);
  const usingFallback = own.length === 0;
  const usable = usingFallback ? circuitPhotoUrls.filter(Boolean) : own;

  const current = usable[active];
  const state: State = current ? states[current] ?? "loading" : "error";

  const mark = (url: string, next: State) => setStates((prev) => (prev[url] === next ? prev : { ...prev, [url]: next }));

  if (usable.length === 0) {
    return (
      <MediaPlaceholder label={circuit ? `No imagery available yet for ${circuit}.` : "No race imagery available for this round yet."} />
    );
  }
  if (state === "error" && usable.length === 1) return <MediaPlaceholder label="Race imagery unavailable." />;

  const alt = usingFallback
    ? `${circuit ?? "Circuit"} - venue photography`
    : `${raceName}${circuit ? ` at ${circuit}` : ""}`;

  return (
    <div>
      <div className="relative w-full overflow-hidden rounded-md bg-white/[0.02]" style={{ aspectRatio: "16 / 7" }}>
        {state !== "loaded" && <MediaSkeleton fill rounded="rounded-md" />}
        {state !== "error" && (
          <Image
            key={current}
            src={current}
            alt={alt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1000px"
            className={`object-cover transition-opacity duration-500 ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
            onLoad={() => mark(current, "loaded")}
            onError={() => mark(current, "error")}
          />
        )}
        {state === "error" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-neutral-500">Race imagery unavailable.</p>
          </div>
        )}
        {/* Softens the foot of the image so the metadata beneath it doesn't butt against a hard edge. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />

        {/* This is what keeps a circuit photo honest: labelled every time it stands in for a
            round's own coverage, never silently presented as this weekend's photography. */}
        {usingFallback && state === "loaded" && (
          <span className="absolute bottom-2.5 left-2.5 rounded-full border border-white/[0.14] bg-black/50 px-2 py-0.5 text-[10px] font-medium text-neutral-300 backdrop-blur-sm">
            Circuit imagery
          </span>
        )}
      </div>

      {usable.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-hide" role="group" aria-label={`${circuit ?? raceName} photos`}>
          {usable.slice(0, 6).map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1} of ${Math.min(usable.length, 6)}`}
              aria-current={i === active}
              className={`relative h-12 w-20 shrink-0 overflow-hidden rounded-[3px] border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
                i === active ? "border-[var(--f1-red)]/60" : "border-white/[0.1] opacity-60 hover:opacity-100"
              }`}
            >
              {states[url] !== "loaded" && <MediaSkeleton fill rounded="rounded-[3px]" />}
              <Image
                src={url}
                alt=""
                fill
                sizes="80px"
                className={`object-cover transition-opacity duration-300 ${states[url] === "loaded" ? "opacity-100" : "opacity-0"}`}
                onLoad={() => mark(url, "loaded")}
                onError={() => mark(url, "error")}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Occupies the same box a real image would, so a round without any photography doesn't collapse
 * the layout or leave a hole. Branded rather than blank. */
function MediaPlaceholder({ label }: { label: string }) {
  return (
    <div
      className="flex w-full items-center justify-center overflow-hidden rounded-md border border-white/[0.06] bg-white/[0.015]"
      style={{ aspectRatio: "16 / 7" }}
    >
      <div className="text-center">
        <span aria-hidden className="text-lg text-[var(--f1-red)]/50">
          ✦
        </span>
        <p className="mt-1 max-w-[24ch] text-xs text-neutral-600">{label}</p>
      </div>
    </div>
  );
}
