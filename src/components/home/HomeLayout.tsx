import { RotatingBackdrop } from "./RotatingBackdrop";

/** The one full-bleed backdrop + 80vw content column shared by Public/Personal home — same shape
 * the homepage already used before this redesign (a fixed-height photo band pinned to the top,
 * fading into the flat page background by the time it ends, with every section's own content
 * flowing in a narrower column on top of and below it), just shared between both auth states
 * instead of signed-in-only. `sm:max-w-[80vw]` matches the content-grid width already used
 * elsewhere in the app (e.g. /groups), not a new one invented for this page.
 *
 * The static radial glow behind RotatingBackdrop is what keeps a loading state (photos=[], see
 * every *Skeleton export in this folder) from reading as a flat, opaque black slab layered on top
 * of the page — with no photo to crossfade in, the linear gradient alone was just
 * var(--background) blended with itself, meaningfully flatter than the real hero's photo-lit band.
 * This doesn't fabricate a circuit photo; it's the same subtle premium-dark vignette treatment,
 * present whether or not a photo is loaded, so loading and loaded share one visual environment
 * instead of loading looking like a different, darker UI. */
export function HomeLayout({ photos, children }: { photos: string[]; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[115vh] max-h-[1080px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(225,6,0,0.08), transparent 70%)" }}
        />
        <RotatingBackdrop photos={photos} />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--background)]/50 via-[var(--background)]/85 to-[var(--background)]" />
      </div>
      <div className="relative mx-auto space-y-12 px-4 py-10 sm:max-w-[80vw] sm:px-8 lg:px-12">{children}</div>
    </div>
  );
}
