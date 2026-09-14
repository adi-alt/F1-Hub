import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircuitExplorerHeader } from "./components/CircuitExplorerHeader";
import { SeasonJourney } from "./components/SeasonJourney";
import { NextRaceFocus } from "./components/NextRaceFocus";
import { getCircuitsExplorerData } from "./services/circuits.service";
import { getUserProfile } from "@/lib/supabase/users";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { slugifyRaceName } from "@/lib/routes";

async function CircuitsIndex({ year, uid }: { year: number; uid: string }) {
  const [data, profile] = await Promise.all([
    getCircuitsExplorerData(year, uid),
    getUserProfile(uid),
  ]);
  const { entries, completedCount, remainingCount } = data;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <CircuitExplorerHeader year={year} totalCircuits={entries.length} completedCount={completedCount} remainingCount={remainingCount} />
      {/* The whole season, always visible, in one connected rail - see SeasonJourney's own
          docstring for why this replaces both the old vertical timeline and the separate
          SeasonProgressStrip (the two are now one visualization, not a summary bar above a
          different, disconnected list of cards below it). */}
      <SeasonJourney entries={entries} favoriteTracks={profile?.favoriteTracks ?? []} />
      <NextRaceFocus entries={entries} />
    </div>
  );
}

export const metadata: Metadata = {
  title: "Circuits",
  description: "Every circuit on the current F1 calendar — track intelligence, race history, and records.",
};

// Dynamic Legacy Route Canonicalization: 
// The circuits section previously used ?circuit= routing. We dynamically redirect to canonical 
// /circuits/[slug] paths here, preserving any additional query parameters.
export default async function CircuitsPage({
  searchParams,
}: {
  searchParams: Promise<{ circuit?: string; [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SignInGate label="circuit intelligence" />
      </div>
    );
  }

  const params = await searchParams;
  if (params.circuit) {
    const slug = slugifyRaceName(params.circuit);
    const newPath = `/circuits/${slug}`;
    
    // Preserve other query parameters
    const otherParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'circuit' && value) {
        if (Array.isArray(value)) {
          value.forEach(v => otherParams.append(key, v));
        } else {
          otherParams.append(key, value);
        }
      }
    }
    
    const queryString = otherParams.toString();
    redirect(queryString ? `${newPath}?${queryString}` : newPath);
  }

  const year = new Date().getFullYear();
  return <CircuitsIndex year={year} uid={session.uid} />;
}
