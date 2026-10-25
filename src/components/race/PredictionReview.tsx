import { Check, X } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import type { PolePredictionAccuracy, PredictionAccuracy } from "@/lib/predictionAccuracy";
import type { RaceDoc } from "@/lib/types/race";
import { teamColor } from "@/lib/teamColors";

function Mark({ hit, label }: { hit: boolean; label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`flex size-6 shrink-0 items-center justify-center rounded-full ${hit ? "bg-success/15 text-success" : "bg-white/[0.04] text-tertiary"}`}
    >
      <Icon icon={hit ? Check : X} size={16} />
    </span>
  );
}

/**
 * "How the predictions did", in the race's ⋯ sheet: one sentence on the winner, the model's podium beside the real
 * one with a tick on every driver it got onto the podium, one row of figures in plain words, and the pole call.
 * Each fact appears once.
 */
export function PredictionReview({
  accuracy,
  poleAccuracy,
  race,
  nameOf,
}: {
  accuracy: PredictionAccuracy | null;
  poleAccuracy: PolePredictionAccuracy | null;
  race: RaceDoc;
  nameOf: (code: string) => string;
}) {
  const teams = new Map([...(race.inputs ?? []), ...(race.results ?? [])].map((d) => [d.driver, d.team]));
  const driver = (code: string) => {
    const team = teams.get(code);
    return (
      <span className="flex min-w-0 items-center gap-2 text-body-sm">
        <span aria-hidden className="h-5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: team ? teamColor(team) : "transparent" }} />
        <span className="min-w-0 truncate text-primary">
          <span className="sm:hidden">{nameOf(code).split(" ").slice(-1)[0]}</span>
          <span className="hidden sm:inline">{nameOf(code)}</span>
        </span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {accuracy && (
        <>
          <p className="text-title-md text-primary">
            {accuracy.predictedWinner === accuracy.actualWinner
              ? `The model called it: ${nameOf(accuracy.actualWinner)} won.`
              : `The model picked ${nameOf(accuracy.predictedWinner)}; ${nameOf(accuracy.actualWinner)} won.`}
          </p>

          <div className={`${PANEL} grid grid-cols-2 divide-x divide-white/[0.06]`}>
            {(
              [
                { title: "Model's podium", list: accuracy.predictedPodium, other: accuracy.actualPodium, hit: "finished on the podium", miss: "missed the podium" },
                { title: "Actual podium", list: accuracy.actualPodium, other: accuracy.predictedPodium, hit: "the model had on its podium", miss: "not on the model's podium" },
              ] as const
            ).map((col) => (
              <div key={col.title} className="min-w-0 px-4 py-4">
                <h3 className={EYEBROW}>{col.title}</h3>
                <ol className="mt-3 space-y-3">
                  {col.list.map((code, i) => (
                    <li key={code} className="flex items-center gap-2.5">
                      <span className="w-6 shrink-0 text-caption tabular text-tertiary">P{i + 1}</span>
                      <span className="min-w-0 flex-1">{driver(code)}</span>
                      <Mark hit={col.other.includes(code)} label={col.other.includes(code) ? col.hit : col.miss} />
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-caption text-secondary">Podium places right</dt>
              <dd className="mt-1 text-body font-medium tabular text-primary">{accuracy.podiumHits} of 3</dd>
            </div>
            <div>
              <dt className="text-caption text-secondary">Typical miss, every driver</dt>
              <dd className="mt-1 text-body font-medium tabular text-primary">
                {accuracy.positionMAE < 0.95 ? "Under a place" : `About ${Math.round(accuracy.positionMAE)} places`}
              </dd>
            </div>
          </dl>
        </>
      )}

      {poleAccuracy && (
        <div className="flex items-center gap-3 border-t border-white/[0.06] pt-5">
          <Mark hit={poleAccuracy.hit} label={poleAccuracy.hit ? "Pole called" : "Pole missed"} />
          <p className="min-w-0 text-body-sm text-secondary">
            {poleAccuracy.hit ? (
              <>
                Pole: called <span className="text-primary">{nameOf(poleAccuracy.actualPole)}</span> before qualifying.
              </>
            ) : (
              <>
                Pole: the model had <span className="text-primary">{nameOf(poleAccuracy.predictedPole)}</span>;{" "}
                <span className="text-primary">{nameOf(poleAccuracy.actualPole)}</span> took it.
              </>
            )}
          </p>
        </div>
      )}

      {accuracy?.reconstructed && <ProvenanceLine source="Prediction rebuilt after the race" status="from the same pre-race data; not frozen beforehand" />}
    </div>
  );
}
