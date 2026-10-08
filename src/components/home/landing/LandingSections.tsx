"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Flag, MapPin, Users } from "lucide-react";
import { outlookHeadline } from "@/components/race/ModelOutlook";
import { Button } from "@/components/ui/Button";
import { DriverIdentity } from "@/components/ui/DriverIdentity";
import { Icon } from "@/components/ui/Icon";
import { ProbabilityMeter } from "@/components/ui/ProbabilityMeter";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import { Section } from "@/components/ui/Section";
import { Surface } from "@/components/ui/Surface";
import { Table, type TableColumn } from "@/components/ui/Table";
import type { LandingData, LandingSeason } from "@/lib/homeData";
import { raceHref, seasonHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";

const TEXT_LINK =
  "inline-flex items-center gap-1 rounded-control text-body-sm font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

type Standing = LandingSeason["top5"][number] & { position: number };

/** "This season": the championship's top five and the most recent podium, as real data, not a description of it. */
export function LandingSeasonSection({ year, season }: { year: number; season: LandingSeason }) {
  if (season.top5.length === 0) return null;
  const rows: Standing[] = season.top5.map((s, i) => ({ ...s, position: i + 1 }));
  const [leader, second] = rows;
  const columns: TableColumn<Standing>[] = [
    { key: "position", header: "Pos", numeric: true, width: "3.5rem" },
    { key: "driver", header: "Driver", render: (s) => <DriverIdentity code={s.driver} name={s.driverName} team={s.team} /> },
    { key: "wins", header: "Wins", align: "end", numeric: true },
    { key: "points", header: "Pts", align: "end", numeric: true, render: (s) => <span className="font-semibold">{s.points}</span> },
  ];
  const last = season.lastRace;
  return (
    <Section
      id="this-season"
      level={2}
      title="This season"
      description={`${leader.driverName} leads${second ? ` by ${leader.points - second.points} points` : ""} after ${season.roundsCompleted} of ${season.totalRounds} rounds.`}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="min-w-0">
          <Table caption={`${year} drivers' championship, top five`} columns={columns} rows={rows} getRowKey={(s) => s.driver} rowHeader="driver" />
          <Link href={seasonHref(year)} className={`${TEXT_LINK} mt-3`}>
            Full standings
            <Icon icon={ArrowRight} size={16} />
          </Link>
        </div>
        {last && last.podium.length > 0 && (
          <Surface level={1} as="section" aria-labelledby="last-race">
            <p className="text-caption text-secondary">Last time out</p>
            <h3 id="last-race" className="mt-1 text-title-md text-primary">
              {last.name}
            </h3>
            <ol className="mt-4 divide-y divide-subtle">
              {last.podium.map((p, i) => (
                <li key={p.driver} className="flex items-center gap-3 py-2.5">
                  <span className="w-5 text-body-sm tabular text-secondary">{i + 1}</span>
                  <DriverIdentity code={p.driver} name={p.driverName} team={p.team} className="min-w-0 flex-1" />
                  <span className="text-body-sm tabular text-secondary">{i === 0 ? "Winner" : p.finishGapSec !== null ? `+${p.finishGapSec.toFixed(3)}s` : ""}</span>
                </li>
              ))}
            </ol>
            <Link href={raceHref(last.year, last.round, last.name)} className={`${TEXT_LINK} mt-3`}>
              Race report
              <Icon icon={ArrowRight} size={16} />
            </Link>
          </Surface>
        )}
      </div>
    </Section>
  );
}

/** "Can you beat the model?": the next race's real win odds, and the one action a visitor can take about them. */
export function LandingModelSection({ landing }: { landing: LandingData }) {
  const openAuth = useAuthDialogStore((s) => s.open);
  const race = landing.nextRace;
  const drivers = race?.simulation?.drivers;
  if (!race || !drivers?.length) return null;
  const nameOf = (code: string) => race.inputs?.find((i) => i.driver === code)?.driverName ?? code;
  return (
    <Section id="beat-the-model" level={2} title="Can you beat the model?" description="Before every race the model simulates it 10,000 times. Pick your podium, then see who called it.">
      <Surface level={1}>
        <p className="text-body text-primary">{outlookHeadline(drivers, nameOf)}</p>
        <ProbabilityMeter
          className="mt-5"
          caption={`Chance of winning the ${race.name}`}
          entries={drivers.map((d) => ({ label: d.driver, value: d.p1, color: teamColor(d.team) }))}
        />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <ProvenanceLine source={`Apex model ${race.simulation!.modelVersion}`} status="frozen after qualifying" />
          <Button variant="primary" size="md" onClick={openAuth}>
            Make your podium pick
          </Button>
        </div>
      </Surface>
    </Section>
  );
}

const ARCHIVE_ENTRIES = [
  { section: "year", title: "By season", body: "Every championship since 1950, race by race.", icon: CalendarDays },
  { section: "track", title: "By circuit", body: "Who wins where, and how each track has changed.", icon: MapPin },
  { section: "driver", title: "By driver", body: "Careers, head to head, and the records they hold.", icon: Flag },
  { section: "team", title: "By team", body: "Constructors through the eras, from Alfa to McLaren.", icon: Users },
] as const;

/** "Every race since 1950": four ways into the archive, each one a real page. */
export function LandingArchiveSection() {
  return (
    <Section id="archive" level={2} title="Every race since 1950" description="Results, qualifying, pit stops and lap times, for more than a thousand Grands Prix.">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ARCHIVE_ENTRIES.map((e) => (
          <li key={e.section} className="min-w-0">
            <Surface level={1} interactive href={`/archive?section=${e.section}`} linkLabel={`Archive ${e.title.toLowerCase()}`} className="h-full">
              <Icon icon={e.icon} size={20} className="text-secondary" />
              <p className="mt-3 text-body font-semibold text-primary">{e.title}</p>
              <p className="mt-1 text-body-sm text-secondary">{e.body}</p>
            </Surface>
          </li>
        ))}
      </ul>
    </Section>
  );
}
