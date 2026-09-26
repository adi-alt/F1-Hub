"use client";

import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";

/**
 * The race page's contribution to the ONE global Ask Apex - same placement, same panel, same
 * interaction model as SeasonApexScope/CircuitApexScope. Only the scope changes: a race identity
 * (never a fact) that the server re-resolves and grounds itself (buildRaceGroundingContext in the
 * ask-apex route) - see that function's own comment for why what's actually answerable differs by
 * phase (a finished race gets its own real result/standings-impact context; an unrun one gets this
 * circuit's own real history instead, since there's nothing else true to say about it yet).
 *
 * Two identity shapes, matching RaceApexContext: a live-season race sends `raceId` (a real `races`
 * row, or `circuit`/`year` alone for a calendar-only placeholder that has no such row yet); an
 * archive race sends `archiveYear`/`archiveRound` instead, since that table has no shared id space
 * with `races`.
 */
export function RaceApexScope({
  raceId,
  archiveYear,
  archiveRound,
  circuit,
  year,
  name,
  status,
}: {
  raceId?: string;
  archiveYear?: number;
  archiveRound?: number;
  circuit: string;
  year: number;
  name: string;
  /** "completed" only for a race with real results - a race that's merely past its scheduled date
   * but not yet resolved by the pipeline is still "not completed" here, same distinction the page
   * itself makes (see SeasonRaceDashboard's own `isCompleted`). */
  status: "completed" | "upcoming";
}) {
  const suggestions =
    status === "completed"
      ? [
          "What decided this race?",
          "What were the biggest historical surprises at this Grand Prix?",
          "How did the podium compare to the grid?",
          "How has my prediction accuracy been at this circuit?",
        ]
      : [
          "Who has historically dominated this circuit?",
          "Which constructor has the best historical record here?",
          "Who is the youngest driver to win at this Grand Prix?",
          "How important is qualifying at this circuit?",
        ];

  useRegisterApexScope({
    key: archiveYear !== undefined && archiveRound !== undefined ? `race:archive:${archiveYear}:${archiveRound}` : `race:${raceId ?? `${circuit.toLowerCase()}:${year}`}:${status}`,
    label: name,
    sublabel: status === "completed" ? "Race results" : "Race weekend",
    context: {
      page: "race",
      raceId,
      archiveYear,
      archiveRound,
      circuit,
      year,
    },
    suggestions: suggestions.slice(0, 4),
  });

  return null;
}
