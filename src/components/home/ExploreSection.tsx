import { TreasureMapSection } from "./TreasureMapSection";
import { ARCHIVE_EARLIEST_YEAR, archiveLatestYear } from "@/lib/archiveYears";

/** "What you can explore" — the existing scroll-driven road story, unchanged, just given its own
 * heading in the redesigned page structure instead of living inside AboutSection. This module is
 * imported directly from PublicHome.tsx's "use client" tree, which pulls it into the client bundle
 * too regardless of its own missing directive - lib/archiveYears.ts (not lib/supabase/archive.ts,
 * which drags in supabaseAdmin) is the safe source for the real year range (archiveLatestYear is the
 * season before the current one, from the calendar, not a hardcoded number - TreasureMapSection's
 * own stat used to say "2017" unconditionally, years out of date). `season` is the current one. */
export function ExploreSection({ season }: { season: number }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">What you can explore</h2>
      <div className="mt-6">
        <TreasureMapSection archiveYearRange={`${ARCHIVE_EARLIEST_YEAR} to ${archiveLatestYear(season)}`} />
      </div>
    </section>
  );
}
