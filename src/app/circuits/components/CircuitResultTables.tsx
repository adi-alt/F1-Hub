"use client";

import { useState } from "react";
import { ClassificationTable } from "@/components/circuit/ClassificationTable";
import { GridToFinishChart } from "@/components/circuit/GridToFinishChart";
import type { CurrentDriver, CurrentTeam } from "@/lib/supabase/media";
import type { RaceDoc } from "@/lib/types/race";

/** The classification and the grid-to-finish chart, linked: hovering or selecting a driver in either highlights them
 * in the other. (They used to share this with the schematic track map; that's now the real circuit above.) */
export function CircuitResultTables({ race, currentDrivers, currentTeams }: { race: RaceDoc; currentDrivers: CurrentDriver[]; currentTeams: CurrentTeam[] }) {
  const [hoverDriver, setHoverDriver] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  if (!race.results) return null;
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-10">
      <div className="min-w-0">
        <p className="mb-3 text-body-sm font-semibold text-primary">{race.year} classification</p>
        <ClassificationTable
          results={race.results}
          currentDrivers={currentDrivers}
          currentTeams={currentTeams}
          hoverDriver={hoverDriver}
          onHoverDriver={setHoverDriver}
          selectedDriver={selectedDriver}
          onSelectedDriver={setSelectedDriver}
        />
      </div>
      <div className="min-w-0">
        <p className="mb-3 text-body-sm font-semibold text-primary">Grid → finish</p>
        <GridToFinishChart results={race.results} tireStints={race.tireStints ?? []} hoverDriver={hoverDriver} onHoverDriver={setHoverDriver} />
      </div>
    </div>
  );
}
