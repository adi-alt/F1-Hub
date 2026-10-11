import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircuitsHome } from "./components/CircuitsHome";
import { getCircuitsExplorerData } from "./services/circuits.service";
import { getUserProfile } from "@/lib/supabase/users";
import { SignInGate } from "@/components/auth/SignInGate";
import { getSession } from "@/lib/session/getSession";
import { slugifyRaceName } from "@/lib/routes";
import { getCurrentSeason } from "@/lib/currentSeason";

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
      <div className="page-content py-10">
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

  const year = await getCurrentSeason(); // from the calendar, not the clock (R-22)
  return <CircuitsIndex year={year} uid={session.uid} />;
}
