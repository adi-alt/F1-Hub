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
      <p className="text-caption text-secondary">Track character</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="rounded-full border border-subtle bg-white/[0.04] px-3 py-1 text-caption font-medium text-secondary">
            {tag}
          </span>
        ))}
      </div>
      {avgFieldMovement !== null && (
        <p className="mt-2.5 text-caption text-tertiary">
          Average grid-to-finish movement of {avgFieldMovement.toFixed(1)} places across every classified season on record here.
        </p>
      )}
    </section>
  );
}
