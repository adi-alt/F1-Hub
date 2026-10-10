import Link from "next/link";
import { raceTitle } from "@/lib/format";
import type { CircuitFacts } from "@/lib/circuitFacts";

/** The circuit's own identity - not the Grand Prix's. A venue can host different Grand Prix names over the decades;
 * the physical place, its length, its turns and its lap record do not change with the name on the trophy. Every
 * figure is omitted, not guessed at, when this circuit isn't in circuitFacts.ts yet - a real gap stays a gap. */
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

  const stats = facts
    ? [
        { label: "Length", value: `${facts.lengthKm.toFixed(3)} km` },
        { label: "Turns", value: String(facts.turns) },
        { label: "Direction", value: facts.direction === "clockwise" ? "Clockwise" : "Anticlockwise" },
        { label: "Type", value: facts.trackType === "street" ? "Street" : facts.trackType === "hybrid" ? "Hybrid" : "Permanent" },
        { label: "First Grand Prix", value: String(facts.firstGrandPrix) },
        facts.lapRecord ? { label: `Lap record · ${facts.lapRecord.year}`, value: `${facts.lapRecord.timeSec.toFixed(3)}s`, detail: facts.lapRecord.driverName } : null,
      ].filter((x): x is { label: string; value: string; detail?: string } => x !== null)
    : [];

  return (
    <header className="mb-12">
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-body-sm">
        <Link href="/circuits" className="text-secondary transition-colors hover:text-primary">
          Circuits
        </Link>
        <span aria-hidden className="text-tertiary">
          /
        </span>
        <span className="truncate text-primary" aria-current="page">
          {displayName}
        </span>
      </nav>
      <h1 className="text-[40px] font-bold leading-none tracking-[-0.03em] text-white sm:text-6xl">{displayName}</h1>
      <p className="mt-3 text-body text-secondary">
        {grandPrixName ?? "Grand Prix"}
        {(location || country) && <span className="text-tertiary"> · {[location, country].filter(Boolean).join(", ")}</span>}
      </p>

      {stats.length > 0 && (
        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/[0.08] pt-6 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="text-caption text-secondary">{item.label}</dt>
              <dd className="mt-1 truncate text-body-sm font-medium tabular text-primary">{item.value}</dd>
              {item.detail && <dd className="mt-0.5 truncate text-caption text-secondary">{item.detail}</dd>}
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}
