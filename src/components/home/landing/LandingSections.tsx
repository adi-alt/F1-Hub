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

/** "Every race since 1950": four ways into the archive, each one a real page, each with its own small picture of
 * what's inside - the decades' seasons rising, a circuit lapped, a career arc drawing itself, the teams' colours
 * through the eras. The cards lift on hover. Pictures move on desktop only (globals.css rich-motion); still on phones. */
export function LandingArchiveSection() {
  return (
    <Section id="archive" level={2} title="Every race since 1950" description="Results, qualifying, pit stops and lap times, for more than a thousand Grands Prix.">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ARCHIVE_ENTRIES.map((e) => (
          <li key={e.section} className="min-w-0">
            <Link
              href={`/archive?section=${e.section}`}
              aria-label={`Archive ${e.title.toLowerCase()}`}
              className="group flex h-full flex-col overflow-hidden rounded-card border border-subtle bg-surface-1 transition-[transform,border-color,box-shadow] duration-base hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_20px_44px_-24px_rgb(225_6_0/0.55)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <div aria-hidden className="relative h-28 border-b border-subtle bg-white/[0.02] px-4 py-3">
                <ArchiveCardPicture kind={e.section} />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <span className="flex items-center gap-2">
                  <Icon icon={e.icon} size={20} className="text-secondary transition-colors group-hover:text-brand-text" />
                  <span className="text-body font-semibold text-primary">{e.title}</span>
                </span>
                <span className="mt-1 text-body-sm text-secondary">{e.body}</span>
                <span className="mt-auto flex items-center gap-1 pt-3 text-body-sm font-medium text-secondary transition-colors group-hover:text-primary">
                  Explore
                  <ArrowRight aria-hidden size={16} className="transition-transform duration-fast group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const ERA_COLORS = ["Ferrari", "McLaren", "Williams", "Red Bull Racing", "Mercedes", "Lotus F1", "Benetton", "Renault"];

function ArchiveCardPicture({ kind }: { kind: (typeof ARCHIVE_ENTRIES)[number]["section"] }) {
  if (kind === "year") {
    const heights = [26, 38, 34, 50, 44, 64, 56, 74, 52, 68, 86, 62, 78];
    return (
      <div className="flex h-full items-end gap-1">
        {heights.map((h, i) => (
          <span key={i} className="mini-bar flex-1 rounded-t-sm bg-white/30 transition-colors group-hover:bg-white/50" style={{ height: `${h}%`, ["--bar-delay" as string]: `${i * 0.1}s` }} />
        ))}
      </div>
    );
  }
  if (kind === "track") {
    const path = "M14 18 L96 16 C112 16 118 26 114 40 L108 66 C104 80 92 82 82 74 L62 60 C54 54 44 56 40 66 L36 74 C30 86 16 84 14 72 Z";
    return (
      <svg viewBox="0 0 130 92" className="mx-auto h-full">
        <path id="archive-card-track" d={path} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={9} strokeLinejoin="round" />
        <path d={path} fill="none" stroke="rgb(255 255 255 / 0.5)" strokeWidth={1.5} strokeLinejoin="round" />
        <g className="rich-only">
          <circle r={3.2} fill="#e10600">
            <animateMotion dur="5s" repeatCount="indefinite">
              <mpath href="#archive-card-track" />
            </animateMotion>
          </circle>
        </g>
        <circle className="calm-only" cx={14} cy={18} r={3.2} fill="#e10600" />
      </svg>
    );
  }
  if (kind === "driver") {
    // A career's points, season by season: rising, a peak, a long tail.
    return (
      <svg viewBox="0 0 200 80" preserveAspectRatio="none" className="h-full w-full">
        <path d="M0 74 L18 66 L36 58 L54 40 L72 30 L90 14 L108 10 L126 18 L144 30 L162 42 L180 52 L200 60" pathLength={100} fill="none" stroke="#e10600" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="line-draw" />
        <path d="M0 74 L18 66 L36 58 L54 40 L72 30 L90 14 L108 10 L126 18 L144 30 L162 42 L180 52 L200 60 L200 80 L0 80 Z" fill="rgb(225 6 0 / 0.1)" />
      </svg>
    );
  }
  return (
    <div className="relative flex h-full flex-col justify-center gap-1.5 overflow-hidden">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex h-4 overflow-hidden rounded-sm">
          {ERA_COLORS.slice(row, row + 6).map((t) => (
            <span key={t} className="flex-1" style={{ background: teamColor(t), opacity: 0.75 }} />
          ))}
        </div>
      ))}
      <span className="era-sweep pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </div>
  );
}
