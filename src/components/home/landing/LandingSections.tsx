"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Flag, MapPin, Users } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { Section } from "@/components/ui/Section";
import { teamColor } from "@/lib/teamColors";
import { smoothAreaPath, smoothOpenPath, type XY } from "@/lib/smoothPath";
import { useLineReveal } from "@/hooks/useLineReveal";

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
              href={`/?section=archive&tab=${e.section}`}
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

const CAREER: XY[] = [[0, 74], [18, 66], [36, 58], [54, 40], [72, 30], [90, 14], [108, 10], [126, 18], [144, 30], [162, 42], [180, 52], [200, 60]];
const CAREER_LINE = smoothOpenPath(CAREER);
const CAREER_AREA = smoothAreaPath(CAREER, 80);

const ERA_COLORS = ["Ferrari", "McLaren", "Williams", "Red Bull Racing", "Mercedes", "Lotus F1", "Benetton", "Renault"];

function ArchiveCardPicture({ kind }: { kind: (typeof ARCHIVE_ENTRIES)[number]["section"] }) {
  const revealRef = useLineReveal<SVGSVGElement>();
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
    // A career's points, season by season: rising, a peak, a long tail, drawn as one smooth curve that reveals itself
    // left to right on a desktop (globals.css .line-reveal).
    return (
      <svg ref={revealRef} viewBox="0 0 200 80" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <clipPath id="archive-card-career">
            <rect className="line-reveal" x={0} y={0} width={200} height={80} />
          </clipPath>
        </defs>
        <g clipPath="url(#archive-card-career)">
          <path d={CAREER_AREA} fill="rgb(225 6 0 / 0.1)" />
          <path d={CAREER_LINE} fill="none" stroke="#e10600" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </g>
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
