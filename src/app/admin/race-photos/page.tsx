import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ExternalLink, ImageOff } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { getSiteAdmin } from "@/lib/siteAdmin";
import { getReview, listReviewRaces, type ReviewRace } from "@/lib/supabase/racePhotos";
import { getRacesByYear } from "@/lib/supabase/races";
import { getCurrentSeason } from "@/lib/currentSeason";
import { softFail } from "@/lib/softFail";
import { PHOTO_SCANS, inScanWindow, nextPhotoScan } from "@/lib/racePhotoSchedule";
import { RacePhotoReview } from "./RacePhotoReview";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: "Race photos", description: "Approve race photos.", path: "/admin/race-photos", index: false });

/** The scan runs as a GitHub Actions workflow; the site has no credentials to start it, so "fetch now" opens it there. */
const WORKFLOW_URL = "https://github.com/adi-alt/F1-Hub/actions/workflows/race-photos.yml";
const MAX_APPROVED = 4;

const STATUSES = [
  { id: "all", label: "All races" },
  { id: "review", label: "Needs review" },
  { id: "done", label: "Done" },
] as const;
type Status = (typeof STATUSES)[number]["id"];

const matches = (r: ReviewRace, status: Status) =>
  status === "all" || (status === "review" ? r.pending > 0 && r.approved < MAX_APPROVED : r.pending === 0 || r.approved >= MAX_APPROVED);

const shortName = (r: { year: number; name: string }) => `${r.year} ${r.name.replace(/ Grand Prix$/, " GP")}`;

const scanLabel = (d: Date) =>
  d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

const CHIP = "inline-flex h-8 items-center rounded-full border px-3 text-body-sm transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

/**
 * Where a site admin approves race photos (pipeline/race_photos.py finds the candidates; nothing reaches a race
 * page until it is approved here). Anyone else gets a 404, so the page doesn't advertise itself.
 */
export default async function RacePhotosAdminPage({ searchParams }: { searchParams: Promise<{ race?: string; status?: string }> }) {
  const admin = await getSiteAdmin();
  if (!admin) notFound();

  const now = new Date();
  const [races, season] = await Promise.all([listReviewRaces(), getCurrentSeason()]);
  const seasonRaces = await softFail("season races", getRacesByYear(season), []);
  const { race: raceParam, status: statusParam } = await searchParams;
  const status: Status = STATUSES.some((s) => s.id === statusParam) ? (statusParam as Status) : "all";
  const shown = races.filter((r) => matches(r, status));
  const current = races.find((r) => r.id === raceParam) ?? shown.find((r) => r.pending > 0) ?? shown[0];
  const review = current ? await getReview(current.id) : null;

  const known = new Set(races.map((r) => r.id));
  const waiting = seasonRaces.filter((r) => !known.has(r.id) && r.raceDate && inScanWindow(r.raceDate, now));
  const pending = races.reduce((n, r) => n + r.pending, 0);
  const approved = races.reduce((n, r) => n + r.approved, 0);
  const next = nextPhotoScan(now);
  const href = (p: { race?: string; status?: Status }) => {
    const q = new URLSearchParams();
    if (p.status && p.status !== "all") q.set("status", p.status);
    if (p.race) q.set("race", p.race);
    const s = q.toString();
    return `/admin/race-photos${s ? `?${s}` : ""}`;
  };

  const stats = [
    { label: "Waiting for review", value: String(pending) },
    { label: "Approved photos", value: String(approved) },
    { label: "Races with candidates", value: String(races.length) },
    { label: "Next scan", value: scanLabel(next) },
  ];

  return (
    <div className="page-wide py-8">
      <PageHeader
        title="Race photos"
        meta="Wikimedia Commons photos found by the scan. Approve up to four per race; nothing shows on a race page until it is approved here."
        actions={
          <Button variant="secondary" size="sm" iconEnd={ExternalLink} asChild>
            <a href={WORKFLOW_URL} target="_blank" rel="noopener noreferrer">
              Run a scan now
            </a>
          </Button>
        }
      />

      <dl className={`${PANEL} mt-8 grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-4 lg:grid-cols-4`}>
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="text-caption text-secondary">{s.label}</dt>
            <dd className="mt-1 text-body font-medium tabular text-primary">{s.value}</dd>
          </div>
        ))}
      </dl>

      {races.length === 0 ? (
        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className={`${PANEL} px-6 py-6`}>
            <Icon icon={ImageOff} size={24} className="text-tertiary" />
            <h2 className="mt-3 text-title-md text-primary">No photos to review yet</h2>
            <p className="mt-2 max-w-prose text-body-sm text-secondary">
              Candidates arrive when the scan finds licensed Wikimedia Commons photos of a race. Photographers usually upload a day or more after a
              session, so a race often has nothing until the Monday scan. The next scan is <span className="text-primary">{scanLabel(next)}</span>; an
              email goes to admins when there is something to choose.
            </p>
            <h3 className={`${EYEBROW} mt-6`}>When the scan runs</h3>
            <ul className="mt-3 space-y-3">
              {PHOTO_SCANS.map((s) => (
                <li key={s.label} className="flex gap-3">
                  <Icon icon={CalendarClock} size={16} className="mt-0.5 shrink-0 text-tertiary" />
                  <span className="text-body-sm">
                    <span className="text-primary">{s.label}</span>
                    <span className="text-secondary">{` (${String(s.hourUtc).padStart(2, "0")}:00 UTC): ${s.note}.`}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-caption text-tertiary">
              Can&apos;t wait? &quot;Run a scan now&quot; opens the Race photos workflow on GitHub: choose Run workflow, target production, and optionally one race.
              The site itself has no way to start it.
            </p>
          </section>
          <WaitingRaces races={waiting} />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-6">
            <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <Link
                  key={s.id}
                  href={href({ status: s.id })}
                  aria-current={s.id === status ? "page" : undefined}
                  className={`${CHIP} ${s.id === status ? "border-strong bg-surface-2 text-primary" : "border-subtle text-secondary hover:bg-surface-2 hover:text-primary"}`}
                >
                  {s.label}
                </Link>
              ))}
            </nav>
            <nav aria-label="Races with photo candidates">
              {shown.length === 0 ? (
                <p className="px-3 text-body-sm text-secondary">No race matches this filter.</p>
              ) : (
                <ul className="space-y-1">
                  {shown.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={href({ status, race: r.id })}
                        aria-current={r.id === current?.id ? "page" : undefined}
                        className={`flex items-baseline justify-between gap-3 rounded-control px-3 py-2 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${r.id === current?.id ? "bg-surface-2 text-primary" : "text-secondary hover:bg-surface-1 hover:text-primary"}`}
                      >
                        <span className="min-w-0 truncate">{shortName(r)}</span>
                        <span className="shrink-0 text-caption tabular">
                          {r.approved}/{MAX_APPROVED}
                          {r.pending > 0 ? ` · ${r.pending} new` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
            {waiting.length > 0 && <WaitingRaces races={waiting} compact />}
          </div>
          {current && review && <RacePhotoReview key={current.id} raceName={`${current.year} ${current.name}`} candidates={review.candidates} approved={review.approved} />}
        </div>
      )}
    </div>
  );
}

/** Races the scan is looking at that have no candidates yet: this weekend's, and the last five weeks'. */
function WaitingRaces({ races, compact = false }: { races: { id: string; year: number; name: string; raceDate?: string; status: string }[]; compact?: boolean }) {
  const body = (
    <>
      <h2 className={EYEBROW}>Being scanned, nothing found yet</h2>
      {races.length === 0 ? (
        <p className="mt-3 text-body-sm text-secondary">No race is inside the scan window right now.</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {races.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-2.5 text-body-sm">
              <span className="min-w-0 truncate text-primary">{shortName(r)}</span>
              <span className="shrink-0 text-caption tabular text-secondary">{r.status === "completed" ? "Raced" : "This weekend"} · {r.raceDate?.slice(5, 10).split("-").reverse().join("/")}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
  return compact ? <section className="px-3">{body}</section> : <section className={`${PANEL} px-6 py-6`}>{body}</section>;
}
