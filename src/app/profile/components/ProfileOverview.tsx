import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { EYEBROW, PANEL } from "@/components/ui/panel";
import { compactCount } from "@/lib/format";
import { accountHref } from "./AccountNav";

export type ProfileOverviewData = {
  memberSince: string;
  role: string | null;
  points: number | null;
  season: number;
  record: { scoredRaces: number; pointsEarned: number; winner: { correct: number; total: number }; podium: { correct: number; total: number } };
  recentPoints: { amount: number; label: string; at: string }[];
  favourites: { kind: string; items: { name: string; href: string }[]; total: number }[];
  communities: { id: string; name: string; avatarUrl: string | null; role: string; href: string }[];
};

const rate = (c: number, t: number) => (t ? `${Math.round((c / t) * 100)}%` : "–");

/**
 * The right-hand side of the Profile section: where you stand this season (points, your race picks' record), the
 * last points movements, your favourites and your communities - all real reads of your own data, each linking to
 * where it can be changed.
 */
export function ProfileOverview({ data }: { data: ProfileOverviewData }) {
  const { record } = data;
  return (
    <div className="space-y-6">
      <section aria-labelledby="season-record" className={`p-5 ${PANEL}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="season-record" className={EYEBROW}>
            Your {data.season} season
          </h2>
          {data.points !== null && (
            <span className="text-caption text-secondary">
              Balance <span className="font-semibold tabular text-primary">{compactCount(data.points)} pts</span>
            </span>
          )}
        </div>
        {record.scoredRaces === 0 ? (
          <p className="mt-3 text-body-sm text-secondary">No race picks scored yet this season. Make one on the next race&apos;s page.</p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {[
              { label: "Pick points", value: compactCount(record.pointsEarned) },
              { label: "Races scored", value: String(record.scoredRaces) },
              { label: "Winners", value: `${record.winner.correct}/${record.winner.total}`, detail: rate(record.winner.correct, record.winner.total) },
              { label: "Podium slots", value: `${record.podium.correct}/${record.podium.total}`, detail: rate(record.podium.correct, record.podium.total) },
            ].map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-caption text-tertiary">{f.label}</dt>
                <dd className="mt-0.5 text-title-md tabular text-primary">{f.value}</dd>
                {f.detail && <dd className="text-caption tabular text-secondary">{f.detail} right</dd>}
              </div>
            ))}
          </dl>
        )}
        {data.recentPoints.length > 0 && (
          <ul className="mt-4 divide-y divide-white/[0.05] border-t border-white/[0.06]">
            {data.recentPoints.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-body-sm">
                <span className="min-w-0 truncate text-secondary">{p.label}</span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-caption tabular text-tertiary">{new Date(p.at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                  <span className={`w-14 text-right font-semibold tabular ${p.amount >= 0 ? "text-success" : "text-secondary"}`}>
                    {p.amount > 0 ? "+" : ""}
                    {p.amount}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="your-favourites" className={`p-5 ${PANEL}`}>
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="your-favourites" className={EYEBROW}>
            Favourites
          </h2>
          <Link href={accountHref("personalisation")} className="flex items-center gap-0.5 rounded-control text-caption text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-focus-ring">
            Edit
            <Icon icon={ChevronRight} size={16} className="size-3.5" />
          </Link>
        </div>
        {data.favourites.every((f) => f.total === 0) ? (
          <p className="mt-3 text-body-sm text-secondary">None yet. Favourites come first across the site: in the standings, the archive and Apex&apos;s briefings.</p>
        ) : (
          <dl className="mt-3 space-y-3">
            {data.favourites.map((f) => (
              <div key={f.kind}>
                <dt className="text-caption text-tertiary">
                  {f.kind} <span className="tabular">· {f.total}</span>
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {f.items.length === 0 ? (
                    <span className="text-body-sm text-tertiary">None</span>
                  ) : (
                    f.items.map((it) => (
                      <Link key={it.href} href={it.href} className="rounded-control border border-white/[0.08] px-2 py-0.5 text-body-sm text-primary transition-colors duration-fast hover:border-white/20">
                        {it.name}
                      </Link>
                    ))
                  )}
                  {f.total > f.items.length && <span className="self-center text-caption text-tertiary">+{f.total - f.items.length} more</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section aria-labelledby="your-communities" className={`p-5 ${PANEL}`}>
        <h2 id="your-communities" className={EYEBROW}>
          Communities <span className="tabular">· {data.communities.length}</span>
        </h2>
        {data.communities.length === 0 ? (
          <p className="mt-3 text-body-sm text-secondary">You haven&apos;t joined one yet.</p>
        ) : (
          <ul className="mt-2">
            {data.communities.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={c.href} className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2 transition-colors duration-fast hover:bg-white/[0.04]">
                  <EntityAvatar imageUrl={c.avatarUrl} name={c.name} seed={c.id} size={28} />
                  <span className="min-w-0 flex-1 truncate text-body-sm text-primary">{c.name}</span>
                  {c.role !== "member" && <span className="text-caption capitalize text-tertiary">{c.role}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
