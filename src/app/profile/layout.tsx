import type { ReactNode } from "react";
import { getSession } from "@/lib/session/getSession";
import { SignInGate } from "@/components/auth/SignInGate";
import { ProfileIdentity, type ProfileIdentityData } from "./components/ProfileIdentity";
import { AccountNav } from "./components/AccountNav";
import { getCurrentSeason } from "@/lib/currentSeason";
import { safeRead } from "@/lib/safeRead";
import { getUserProfile } from "@/lib/supabase/users";
import { getPointsBalance } from "@/lib/supabase/points";
import { getUserGroups } from "@/lib/supabase/groups";
import { getUserPicksForYear } from "@/lib/supabase/picks";
import { getRaceListByYear } from "@/lib/supabase/races";
import { computePredictionPerformance } from "@/lib/predictionPerformance";

/** The masthead's reads: who you are, your balance and this season's record. Each degrades to empty, never failing the page. */
async function loadIdentity(uid: string): Promise<ProfileIdentityData> {
  const season = await getCurrentSeason();
  const [profile, points, groups, picks, races] = await Promise.all([
    safeRead(() => getUserProfile(uid), null),
    safeRead(() => getPointsBalance(uid), null),
    safeRead(() => getUserGroups(uid), []),
    safeRead(() => getUserPicksForYear(uid, season), []),
    safeRead(() => getRaceListByYear(season), []),
  ]);
  const perf = computePredictionPerformance(picks, races);
  const name =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    profile?.displayName ||
    profile?.username ||
    profile?.email ||
    "Your account";
  return {
    uid,
    name,
    username: profile?.username ?? null,
    avatar: profile?.avatar ?? null,
    memberSince: profile?.createdAt ?? null,
    points,
    season,
    stats: [
      { label: `${season} pick points`, value: String(perf.points.earned) },
      { label: "Races scored", value: String(perf.points.races) },
      { label: "Winners called", value: `${perf.winner.correct}/${perf.winner.total}` },
      { label: "Communities", value: String(groups.length) },
    ],
  };
}

export default async function ProfileLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-content py-6">
        <SignInGate label="your account" />
      </div>
    );
  }

  const identity = await loadIdentity(session.uid);

  return (
    <div className="page-content py-8">
      <ProfileIdentity data={identity} />
      <div className="mt-8">
        <AccountNav />
      </div>
      {children}
    </div>
  );
}

