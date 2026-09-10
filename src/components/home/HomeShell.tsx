"use client";

import { useQuery } from "@tanstack/react-query";
import { PersonalHome, PersonalHomeSkeleton } from "./PersonalHome";
import { PublicHome } from "./PublicHome";
import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";
import { useAuth } from "@/providers/AuthProvider";

async function fetchPersonalHomeData(): Promise<PersonalHomeData> {
  const res = await fetch("/api/home/personal");
  if (!res.ok) throw new Error("Failed to load personal home data");
  return res.json() as Promise<PersonalHomeData>;
}

/** The one thing that decides Public vs. Personal — driven entirely by the existing useAuth(),
 * not the request-time session snapshot page.tsx rendered with. This is the actual fix for the
 * "homepage needs a refresh after login/logout" bug: Header/ProfileMenu already react instantly
 * because they read useAuth() directly; the homepage never did, so it never has either.
 *
 * No AnimatePresence/motion fade between states (skeleton -> real content, or public -> personal)
 * - a cross-fade there just reads as the loading state itself flickering/animating, not as a
 * clean swap. Real content underneath is free to animate in on its own (RaceHero etc. already
 * do); the swap between skeleton and content should be instant. */
export function HomeShell({
  publicData,
  initialPersonalData,
  serverAuthed,
}: {
  publicData: PublicHomeData;
  initialPersonalData: PersonalHomeData | null;
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

  if (!resolvedAuthed) return <PublicHome publicData={publicData} />;
  if (!personalData) return <PersonalHomeSkeleton />;
  return (
    <PersonalHome
      publicData={publicData}
      personalData={personalData}
      firstName={personalData.profile?.firstName ?? personalData.profile?.displayName ?? "there"}
      isReturning={!!personalData.profile?.onboardingCompletedAt}
    />
  );
}
