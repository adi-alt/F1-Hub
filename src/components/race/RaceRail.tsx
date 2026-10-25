import Link from "next/link";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { Surface } from "@/components/ui/Surface";
import { tiltProps } from "@/components/motion/useTilt";
import type { PersonalRaceContext } from "@/lib/personalRaceBriefing";
import type { PredictionAccuracy } from "@/lib/predictionAccuracy";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div {...tiltProps()} className="tilt h-full rounded-card">
      <Surface level={1} padding="md" as="section" aria-label={title} className="h-full">
        <h2 className="text-body-sm font-semibold text-primary">{title}</h2>
        <div className="mt-3">{children}</div>
      </Surface>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-body-sm">
      <span className="min-w-0 truncate text-secondary">{label}</span>
      <span className="shrink-0 tabular text-primary">{value}</span>
    </div>
  );
}


/** Whether "You at <circuit>" has anything to show (the race banner's ⋯ menu offers it only then). */
export function hasYourRecord(personal: PersonalRaceContext) {
  return personal.isFirstTime || !!personal.favoriteDriver || !!personal.favoriteTeam || !!personal.accuracy;
}

export function YourRecord({ circuit, personal }: { circuit: string; personal: PersonalRaceContext }) {
  if (personal.isFirstTime) {
    return (
      <Block title="Make it yours">
        <p className="text-body-sm text-secondary">Pick favourite drivers and teams, and this page shows how they have done at {circuit}.</p>
        <Link href="/profile/personalisation" className="mt-3 inline-block rounded-control text-body-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          Set favourites
        </Link>
      </Block>
    );
  }
  const rows = [
    personal.favoriteDriver && { label: personal.favoriteDriver.name, value: `${personal.favoriteDriver.winsHere} ${personal.favoriteDriver.winsHere === 1 ? "win" : "wins"} here` },
    personal.favoriteTeam && { label: personal.favoriteTeam.name, value: `${personal.favoriteTeam.winsHere} ${personal.favoriteTeam.winsHere === 1 ? "win" : "wins"} here` },
    personal.accuracy && { label: "Your picks here", value: `${personal.accuracy.correct} of ${personal.accuracy.total} right` },
  ].filter((r): r is { label: string; value: string } => Boolean(r));
  if (rows.length === 0) return null;
  return (
    <Block title={`You at ${circuit}`}>
      <div className="divide-y divide-subtle">
        {rows.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </Block>
  );
}

export function ModelVerdict({ accuracy, nameOf }: { accuracy: PredictionAccuracy; nameOf: (code: string) => string }) {
  const right = accuracy.predictedWinner === accuracy.actualWinner;
  return (
    <Block title="How the model did">
      <p className="text-body-sm text-primary">
        {right ? `Called it: ${nameOf(accuracy.actualWinner)} to win.` : `Picked ${nameOf(accuracy.predictedWinner)}; ${nameOf(accuracy.actualWinner)} won.`}
      </p>
      <Row label="Podium places right" value={`${accuracy.podiumHits} of 3`} />
      <Row label="Average position error" value={accuracy.positionMAE.toFixed(1)} />
      {accuracy.reconstructed && <ProvenanceLine className="mt-2" source="Prediction rebuilt after the race" status="not frozen beforehand" />}
    </Block>
  );
}
