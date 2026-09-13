import { TreasureMapSection } from "./TreasureMapSection";
import { ARCHIVE_EARLIEST_YEAR, ARCHIVE_LATEST_YEAR } from "@/lib/archiveYears";

/** "What you can explore" — the existing scroll-driven road story, unchanged, just given its own
 * heading in the redesigned page structure instead of living inside AboutSection. This module is
 * imported directly from PublicHome.tsx's "use client" tree, which pulls it into the client bundle
 * too regardless of its own missing directive - lib/archiveYears.ts (not lib/supabase/archive.ts,
 * which drags in supabaseAdmin) is the safe source for the real year range (ARCHIVE_LATEST_YEAR is
 * `currentYear - 1`, not a hardcoded number - TreasureMapSection's own stat used to say "2017"
 * unconditionally, years out of date). */
export function ExploreSection() {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">What you can explore</h2>
      <div className="mt-6">
        <TreasureMapSection archiveYearRange={`${ARCHIVE_EARLIEST_YEAR} to ${ARCHIVE_LATEST_YEAR}`} />
      </div>
    </section>
  );
}
