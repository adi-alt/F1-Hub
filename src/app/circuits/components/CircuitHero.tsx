import Link from "next/link";
import { raceTitle } from "@/lib/format";
import type { CircuitFacts } from "@/lib/circuitFacts";

/** The circuit's own identity - not the Grand Prix's. A venue can host different Grand Prix names
 * over the decades; the physical place, its length, its turns and its lap record do not change
 * with the name on the trophy. Every metadata pill here is omitted, not guessed at, when this
 * circuit isn't in circuitFacts.ts yet - a real gap stays visibly a gap. */
export function CircuitHero({
  location,
  grandPrixName,
  country,
  facts,
}: {
  location: string;
  grandPrixName: string | null;
  country: string | null;
  facts: CircuitFacts | null;
}) {
  const displayName = facts?.venueName ?? raceTitle(location);

  const metaItems = facts
    ? [
        { label: "Length", value: `${facts.lengthKm.toFixed(3)} km` },
        { label: "Turns", value: String(facts.turns) },
        { label: "Direction", value: facts.direction === "clockwise" ? "Clockwise" : "Anticlockwise" },
        { label: "Type", value: facts.trackType === "street" ? "Street" : facts.trackType === "hybrid" ? "Hybrid" : "Permanent" },
        { label: "First Grand Prix", value: String(facts.firstGrandPrix) },
        facts.lapRecord ? { label: "Lap record", value: `${facts.lapRecord.timeSec.toFixed(3)}s · ${facts.lapRecord.driverName} (${facts.lapRecord.year})` } : null,
      ].filter((x): x is { label: string; value: string } => x !== null)
    : [];

  return (
    <header className="mb-8">
      <Link href="/circuits" className="mb-3 inline-block text-xs text-neutral-500 transition hover:text-neutral-300">
        ← Circuits
      </Link>
      <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-white sm:text-[40px]">{displayName}</h1>
      <p className="mt-2 text-sm text-neutral-400">
        {grandPrixName ?? "Grand Prix"}
        {(location || country) && <span className="text-neutral-600"> · {[location, country].filter(Boolean).join(", ")}</span>}
      </p>

      {metaItems.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          {metaItems.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">{item.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-medium text-neutral-200">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
