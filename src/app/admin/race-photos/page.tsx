import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSiteAdmin } from "@/lib/siteAdmin";
import { getReview, listReviewRaces } from "@/lib/supabase/racePhotos";
import { RacePhotoReview } from "./RacePhotoReview";

export const metadata: Metadata = { title: "Race photos", robots: { index: false, follow: false } };

/**
 * Where a site admin approves race photos (pipeline/race_photos.py finds the candidates; nothing reaches a race
 * page until it is approved here). Anyone else gets a 404, so the page doesn't advertise itself.
 */
export default async function RacePhotosAdminPage({ searchParams }: { searchParams: Promise<{ race?: string }> }) {
  const admin = await getSiteAdmin();
  if (!admin) notFound();

  const races = await listReviewRaces();
  const { race: raceParam } = await searchParams;
  const current = races.find((r) => r.id === raceParam) ?? races.find((r) => r.pending > 0) ?? races[0];
  const review = current ? await getReview(current.id) : null;

  return (
    <div className="page-wide py-8">
      <PageHeader
        title="Race photos"
        meta="Wikimedia Commons photos found by the weekly scan. Approve up to four per race; nothing shows on a race page until it is approved here."
      />
      {races.length === 0 ? (
        <p className="mt-12 text-body text-secondary">No candidates yet. The scan runs every Tuesday, or on demand from the Race photos workflow.</p>
      ) : (
        <div className="mt-12 grid grid-cols-1 gap-12 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <nav aria-label="Races with photo candidates">
            <ul className="space-y-1">
              {races.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/race-photos?race=${encodeURIComponent(r.id)}`}
                    aria-current={r.id === current?.id ? "page" : undefined}
                    className={`flex items-baseline justify-between gap-3 rounded-control px-3 py-2 text-body-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${r.id === current?.id ? "bg-surface-2 text-primary" : "text-secondary hover:bg-surface-1 hover:text-primary"}`}
                  >
                    <span className="min-w-0 truncate">
                      {r.year} {r.name.replace(/ Grand Prix$/, " GP")}
                    </span>
                    <span className="shrink-0 text-caption tabular">
                      {r.approved}/4{r.pending > 0 ? ` · ${r.pending} new` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {current && review && <RacePhotoReview key={current.id} raceName={`${current.year} ${current.name}`} candidates={review.candidates} approved={review.approved} />}
        </div>
      )}
    </div>
  );
}
