"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { StartLights } from "@/components/motion/StartLights";
import { PageHeader } from "@/components/ui/PageHeader";
import { StateLabel, type DomainState } from "@/components/ui/Badge";
import { useViewerTimeZone } from "@/hooks/useViewerTimeZone";
import { formatLocalDateTime } from "@/lib/countdown";
import { seasonHref } from "@/lib/routes";

export type RacePageHeaderProps = {
  year: number;
  round: number;
  name: string;
  circuit?: string | null;
  country?: string | null;
  /** Lights out, as the pipeline's naive UTC string; shown in the viewer's own zone. */
  raceStart?: string | null;
  state: DomainState;
  /** A real race photo for the backdrop (Wikimedia Commons, re-hosted). None: a plain header. */
  photoUrl?: string | null;
  /** The phase's one key fact, on the right of the header (and right under the title on a phone): the
   * countdown before the race, the winner after it. */
  keyFact?: ReactNode;
  /** Where the breadcrumb's season link goes (the archive season for an older race). */
  seasonLink?: string;
};

/**
 * The top of a race page (spec §3.2): breadcrumb, the race as the page's one h1, a single meta line (where and
 * when, in your time), one state label, and the phase's key fact. The race photo, when there is one, is the
 * page's one atmospheric element (spec §1.3): behind a scrim measured so text stays readable on any photo.
 */
export function RacePageHeader({
  year,
  round,
  name,
  circuit,
  country,
  raceStart,
  state,
  photoUrl,
  keyFact,
  seasonLink,
}: RacePageHeaderProps) {
  const timeZone = useViewerTimeZone();
  const where = [circuit, country].filter(Boolean).join(", ");
  const when = raceStart ? formatLocalDateTime(raceStart, timeZone) : null;

  return (
    <div className="relative isolate overflow-hidden rounded-overlay bg-surface-1">
      {photoUrl && (
        <>
          <Image
            src={photoUrl}
            alt=""
            fill
            priority
            sizes="(min-width: 1440px) 1376px, 100vw"
            className="backdrop-drift -z-20 object-cover opacity-60"
          />
          {/* Solid on the text side, clear on the far side, and solid along the bottom edge, so the title
              and meta line sit on near-surface-1 whatever the photo is. */}
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-r from-surface-1 via-surface-1/85 to-surface-1/30"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-surface-1 to-transparent"
          />
        </>
      )}
      <div className="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 lg:max-w-2xl">
          {state === "upcoming" && <StartLights className="mb-5" />}
          <PageHeader
            title={name}
            breadcrumbs={[
              { label: `${year} season`, href: seasonLink ?? seasonHref(year) },
              { label: `Round ${round}` },
            ]}
            badge={<StateLabel state={state} />}
            meta={
              <>
                {where}
                {where && when && " · "}
                {when}
              </>
            }
            className="min-w-0"
          />
        </div>
        {keyFact && <div className="shrink-0 lg:text-end">{keyFact}</div>}
      </div>
    </div>
  );
}
