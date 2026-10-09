import type { CircuitTrackMap } from "@/lib/supabase/archive";

const LINK_CLASS =
  "rounded-control underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

/** "Track map: Cherkash, CC BY-SA 4.0" as plain text, for a compact map's tooltip and accessible name. */
export function trackMapCreditText(map: CircuitTrackMap): string {
  return `Track map: ${map.credit}, ${map.license}`;
}

/**
 * A circuit's track map (its Wikipedia article's free lead image, pipeline/circuit_track_maps.py), the only
 * circuit image the app shows. The maps are transparent with black lines, so they sit on a light panel,
 * uncropped (object-contain) and never inverted.
 *
 * `className` sizes the panel (default: full width, 3:2). `compact` is for small thumbnails: no caption, the
 * credit goes in the tooltip and the accessible name instead; the full credit is shown wherever the same map
 * appears at size (the circuit page). Renders nothing without a map: there is no stand-in image.
 */
export function TrackMap({
  map,
  name,
  className,
  compact = false,
}: {
  map: CircuitTrackMap | null | undefined;
  /** The circuit's name, for the alt text. */
  name: string;
  className?: string;
  compact?: boolean;
}) {
  if (!map) return null;
  const alt = `${name} track map`;
  const panel = (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-card bg-neutral-50 ${compact ? "p-1.5" : "p-4"} ${className ?? "aspect-[3/2] w-full"}`}
      title={compact ? trackMapCreditText(map) : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Wikimedia's own 960px rendition, loaded straight from upload.wikimedia.org: next/image would re-host it through the optimiser, and the URL is already a fixed-size thumbnail */}
      <img
        src={map.url}
        alt={compact ? `${alt}. ${trackMapCreditText(map)}` : alt}
        width={960}
        height={640}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </div>
  );
  if (compact) return panel;
  return (
    <figure className="min-w-0">
      {panel}
      <figcaption className="mt-2 text-caption text-secondary">
        Track map:{" "}
        <a href={map.sourceUrl} target="_blank" rel="noopener noreferrer" className={`text-primary ${LINK_CLASS}`}>
          {map.credit}
        </a>
        ,{" "}
        <a href={map.licenseUrl} target="_blank" rel="noopener noreferrer license" className={LINK_CLASS}>
          {map.license}
        </a>
      </figcaption>
    </figure>
  );
}
