import { describeTrackCharacter, type CircuitFacts } from "@/lib/circuitFacts";

/**
 * Qualitative tags, not fabricated 0-100 sliders. A "downforce level: 72/100" bar would be an
 * invented number this app has no real basis for - describeTrackCharacter derives every tag
 * either from the track's own real physical facts (length-per-turn, street vs. permanent, night
 * race) or from real measured history (average grid-to-finish movement across every classified
 * year at this circuit) - never an opinion asserted from nothing.
 */
export function CircuitCharacteristics({ facts, avgFieldMovement }: { facts: CircuitFacts | null; avgFieldMovement: number | null }) {
  if (!facts) return null;
  const tags = describeTrackCharacter(facts, avgFieldMovement);
  if (tags.length === 0) return null;

  return (
    <section aria-label="Track characteristics">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Track character</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium text-neutral-300">
            {tag}
          </span>
        ))}
      </div>
      {avgFieldMovement !== null && (
        <p className="mt-2.5 text-[11px] text-neutral-600">
          Average grid-to-finish movement of {avgFieldMovement.toFixed(1)} places across every classified season on record here.
        </p>
      )}
    </section>
  );
}
