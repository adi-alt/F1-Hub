import { TreasureMapSection } from "./TreasureMapSection";

/** "What you can explore" — the existing scroll-driven road story, unchanged, just given its own
 * heading in the redesigned page structure instead of living inside AboutSection. */
export function ExploreSection() {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">What you can explore</h2>
      <div className="mt-6">
        <TreasureMapSection />
      </div>
    </section>
  );
}
