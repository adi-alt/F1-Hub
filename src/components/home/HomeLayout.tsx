import { Children, type ReactNode } from "react";
import { RotatingBackdrop } from "./RotatingBackdrop";

export type SectionTier = "major" | "normal" | "compact";

// Content-aware vertical rhythm, replacing one uniform gap: a genuinely sparse section (the thin
// YourF1Radar rail) shouldn't float in the same large gap as a dense, multi-part one
// (IntelligenceSection, SeasonRecap) - see the redesign plan's own rationale.
const TIER_GAP: Record<SectionTier, string> = { major: "mt-12", normal: "mt-9", compact: "mt-5" };

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
 * instead of loading looking like a different, darker UI.
 *
 * `sections` (each a {tier, content} pair) replaces a plain `children` list - a section's own tier
 * chooses its top margin from TIER_GAP, so callers (PersonalHome/PublicHome) classify each section
 * once instead of every section fighting one shared `space-y-9`. A bare `children` array is still
 * accepted (defaulting every section to "normal") for a *Skeleton export that doesn't care about
 * per-section rhythm while still loading. */
export function HomeLayout({
  photos,
  sections,
  children,
}: {
  photos: string[];
  sections?: { tier: SectionTier; content: ReactNode }[];
  children?: ReactNode;
}) {
  const resolvedSections = sections ?? Children.toArray(children).map((content) => ({ tier: "normal" as const, content }));
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[100vh] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(225,6,0,0.08), transparent 70%)" }}
        />
        <RotatingBackdrop photos={photos} />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--background)]/50 via-[var(--background)]/85 to-[var(--background)]" />
      </div>
      {/* Starts exactly where the 100vh band above ends (top-[100vh], not bottom-0 inside it) and
          runs 18vh further down - into the real content below, not the last 18vh of the band
          itself, which `overflow-hidden` up there would clip away from ever reaching this far
          anyway. Widened from 8vh - too short to actually read as a blend, just a smaller version
          of the same abrupt stop. */}
      <div className="pointer-events-none absolute inset-x-0 top-[100vh] h-[18vh] bg-gradient-to-b from-[var(--background)]/70 to-transparent" />
      <div className="relative mx-auto px-4 py-10 sm:max-w-[80vw] sm:px-8 lg:px-12">
        {resolvedSections.map((s, i) => (
          <div key={i} className={i === 0 ? "" : TIER_GAP[s.tier]}>
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
}
