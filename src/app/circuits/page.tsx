import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CircuitsHome } from "./components/CircuitsHome";
import { getCircuitDetailData, getCircuitsExplorerData, resolveCircuitSlug } from "./services/circuits.service";
import { CircuitDetailPage } from "./components/CircuitDetailPage";
import { CircuitDetailSkeleton } from "./components/CircuitsSkeletons";
import { getUserProfile } from "@/lib/supabase/users";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { circuitHref, slugifyRaceName } from "@/lib/routes";
import { getCurrentSeason } from "@/lib/currentSeason";
import { pageMetadata } from "@/lib/seo";

async function CircuitsIndex({ year, uid }: { year: number; uid: string }) {
  const [data, profile] = await Promise.all([
    getCircuitsExplorerData(year, uid),
    getUserProfile(uid),
  ]);
  const { entries, completedCount, remainingCount } = data;

  return (
    <div data-surface="frosted" className="page-wide py-8">
      <CircuitsHome entries={entries} favoriteTracks={profile?.favoriteTracks ?? []} year={year} completedCount={completedCount} remainingCount={remainingCount} />
    </div>
  );
}

type CircuitsSearchParams = Promise<{ circuit?: string | string[] }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: { searchParams: CircuitsSearchParams }): Promise<Metadata> {
  const circuit = one((await searchParams).circuit);
  if (circuit) {
    // The slug is the circuit's own name, slugified ("suzuka" -> "Suzuka", "las-vegas" -> "Las Vegas").
    const name = decodeURIComponent(circuit).split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return pageMetadata({
      title: name,
      description: `${name} on the Formula 1 calendar: the track from real timing data, how it changed, past winners and records.`,
      path: circuitHref(circuit),
    });
  }
  return pageMetadata({
    title: "Circuits",
    description: "Every circuit on the Formula 1 calendar: the track drawn from real timing data, how its layout changed, past winners and records.",
    path: "/circuits",
  });
}

/** One circuit (`/circuits?circuit=<slug>`). The URL only ever carries a lowercased slug - resolveCircuitSlug recovers
 * the real, original-cased circuit string (e.g. "Spa-Francorchamps") every live-data lookup needs; see its own doc
 * comment for why a plain `replace(/-/g, " ")` silently broke every circuit's live-season data. */
async function CircuitView({ slug, year, uid }: { slug: string; year: number; uid: string }) {
  const locationName = await resolveCircuitSlug(slug, year, uid);
  const data = await getCircuitDetailData(locationName, year, uid);
  if (!data) notFound();
  return <CircuitDetailPage location={locationName} data={data} />;
}

export default async function CircuitsPage({ searchParams }: { searchParams: CircuitsSearchParams }) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-content py-10">
        <SignInGate label="circuit intelligence" />
      </div>
    );
  }

  const circuit = one((await searchParams).circuit);
  const year = await getCurrentSeason(); // from the calendar, not the clock (R-22)
  if (circuit) {
    // Keyed, so opening another circuit shows its skeleton at once rather than holding the previous page.
    const slug = slugifyRaceName(decodeURIComponent(circuit));
    return (
      <Suspense key={slug} fallback={<CircuitDetailSkeleton />}>
        <CircuitView slug={slug} year={year} uid={session.uid} />
      </Suspense>
    );
  }
  return <CircuitsIndex year={year} uid={session.uid} />;
}
