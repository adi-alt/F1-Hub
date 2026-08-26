import Link from "next/link";
import { notFound } from "next/navigation";
import { RaceRealtimeWatcher } from "@/components/RaceRealtimeWatcher";
import { ScrollToSection } from "@/components/ScrollToSection";
import { HighlightsPanel } from "@/components/race/HighlightsPanel";
import { ModelInfo } from "@/components/race/ModelInfo";
import { PickPanel } from "@/components/race/PickPanel";
import { PolePredictionComparison } from "@/components/race/PolePredictionComparison";
import { PoleSection } from "@/components/race/PoleSection";
import { PracticeSummary } from "@/components/race/PracticeSummary";
import { PredictionComparison } from "@/components/race/PredictionComparison";
import { PredictionPanel } from "@/components/race/PredictionPanel";
import { QualifyingTable } from "@/components/race/QualifyingTable";
import { ResultsTable } from "@/components/race/ResultsTable";
import { MovementChart } from "@/components/charts/MovementChart";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRace } from "@/lib/supabase/races";
import { computeHighlights } from "@/lib/highlights";
import { comparePolePrediction, comparePrediction } from "@/lib/predictionAccuracy";
import { circuitHref, raceSimulationHref, seasonHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

export default async function RacePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; round?: string; section?: string }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="this race" />
      </div>
    );
  }

  const { year, round, section } = await searchParams;
  if (!year || !round) notFound();

  const race = await getRace(Number(year), Number(round));
  if (!race) notFound();

  const highlights = computeHighlights(race);
  const accuracy = comparePrediction(race);
  const poleAccuracy = comparePolePrediction(race);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <RaceRealtimeWatcher raceId={race.id} />
      <ScrollToSection id={section} />
      <Link href={seasonHref(race.year)} className="text-sm text-neutral-500 hover:text-neutral-300">
        ← {race.year} season
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">
            Round {race.round}
          </p>
          <h1 className="text-3xl font-bold text-white">{race.name}</h1>
        </div>
        <div className="flex gap-2">
          {race.simulation && (
            <Link
              href={raceSimulationHref(race.year, race.round)}
              className="rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm text-neutral-300 transition hover:border-white/30"
            >
              Race simulator →
            </Link>
          )}
          <Link
            href={circuitHref(race.circuit)}
            className="rounded-full border border-[var(--f1-line)] px-4 py-2 text-sm text-neutral-300 transition hover:border-white/30"
          >
            Track history →
          </Link>
        </div>
      </div>

      <div className="mt-8 space-y-10">
        {/* Practice/qualifying can exist well before the race itself does, so these render
            unconditionally alongside whatever the race-status branch below shows — raceHref's
            optional `section` param + ScrollToSection can deep-link straight to either. */}
        {race.practice && (
          <div id="practice">
            <h2 className="mb-3 text-lg font-semibold text-white">Practice</h2>
            <PracticeSummary practice={race.practice} />
          </div>
        )}
        {race.inputs && race.inputs.length > 0 && (
          <div id="qualifying">
            <h2 className="mb-3 text-lg font-semibold text-white">Qualifying</h2>
            <QualifyingTable inputs={race.inputs} />
          </div>
        )}

        {race.status === "completed" && race.results ? (
          <div id="results" className="space-y-10">
            {highlights && <HighlightsPanel highlights={highlights} />}
            {(accuracy || poleAccuracy) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {accuracy && <PredictionComparison accuracy={accuracy} />}
                {poleAccuracy && <PolePredictionComparison accuracy={poleAccuracy} />}
              </div>
            )}
            <div>
              <h2 className="mb-3 text-lg font-semibold text-white">Results</h2>
              <ResultsTable results={race.results} />
            </div>
            <div>
              <h2 className="mb-3 text-lg font-semibold text-white">Grid → finish movement</h2>
              <MovementChart results={race.results} />
            </div>
          </div>
        ) : race.prediction ? (
          <div className="space-y-8">
            <PredictionPanel prediction={race.prediction} polePrediction={race.polePrediction} />
            <ModelInfo />
          </div>
        ) : race.polePrediction ? (
          <div className="space-y-6">
            <PoleSection polePrediction={race.polePrediction} />
            <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6 text-center text-neutral-400">
              <p>
                {race.inputs?.length
                  ? "Not enough prior-season history yet to predict a finishing order for this race."
                  : "Finishing-order and race-pace predictions unlock once qualifying happens."}
              </p>
            </div>
            <ModelInfo />
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-8 text-center text-neutral-400">
            <p>No prior-season history exists yet to predict from.</p>
            <p className="mt-1 text-sm text-neutral-500">
              Nothing to do here — this page updates itself automatically as data becomes available.
            </p>
          </div>
        )}
      </div>

      <div className="mt-10">
        <PickPanel race={race} />
      </div>
    </div>
  );
}
