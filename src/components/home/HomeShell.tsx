"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { PersonalHome, PersonalHomeSkeleton } from "./PersonalHome";
import { PublicHome } from "./PublicHome";
import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";
import type { PublicGroupSummary } from "@/lib/supabase/groups";
import { useAuth } from "@/providers/AuthProvider";

async function fetchPersonalHomeData(): Promise<PersonalHomeData> {
  const res = await fetch("/api/home/personal");
  if (!res.ok) throw new Error("Failed to load personal home data");
  return res.json() as Promise<PersonalHomeData>;
}

/** The one thing that decides Public vs. Personal — driven entirely by the existing useAuth(),
 * not the request-time session snapshot page.tsx rendered with. This is the actual fix for the
 * "homepage needs a refresh after login/logout" bug: Header/ProfileMenu already react instantly
 * because they read useAuth() directly; the homepage never did, so it never has either. */
export function HomeShell({
  publicData,
  initialPersonalData,
  discoverGroups,
  serverAuthed,
}: {
  publicData: PublicHomeData;
  initialPersonalData: PersonalHomeData | null;
  discoverGroups: PublicGroupSummary[];
  serverAuthed: boolean;
}) {
  const { user, loading, isAuthorized } = useAuth();

  // Trust the server's own answer until the client has actually finished resolving auth — the
  // cookie was sent with this exact request, so the server is almost always already right, and
  // this avoids ever flashing the wrong homepage while /api/auth/me is still in flight. A purely
  // derived value, not effect-driven state — it recomputes on every render, so a later
  // login/logout (isAuthorized changing) is picked up immediately with no extra render pass.
  const resolvedAuthed = loading ? serverAuthed : isAuthorized;

  // A login that happens *after* this page already mounted (the initial server-rendered bundle,
  // if any, belongs to a different/no user) needs its own client-side fetch — a logout never
  // does, since publicData was already fetched unconditionally and needs no network round trip.
  const initialUid = initialPersonalData?.profile?.uid ?? null;
  const needsRefetch = resolvedAuthed && (!initialPersonalData || (!!user && user.uid !== initialUid));

  const { data: fetchedPersonalData } = useQuery({
    queryKey: ["home-personal", user?.uid],
    queryFn: fetchPersonalHomeData,
    enabled: needsRefetch && !!user,
  });

  const personalData = needsRefetch ? fetchedPersonalData : initialPersonalData;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!resolvedAuthed ? (
        <motion.div key="public" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <PublicHome publicData={publicData} discoverGroups={discoverGroups} />
        </motion.div>
      ) : !personalData ? (
        <motion.div key="personal-loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <PersonalHomeSkeleton />
        </motion.div>
      ) : (
        <motion.div key="personal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <PersonalHome
            publicData={publicData}
            personalData={personalData}
            firstName={personalData.profile?.firstName ?? personalData.profile?.displayName ?? "there"}
            isReturning={!!personalData.profile?.onboardingCompletedAt}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
