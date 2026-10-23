import type { Metadata } from "next";
import type { FavoriteEntity } from "@/components/profile/FavoriteEntityList";
import { PersonalizationTabs, type Tab } from "@/components/profile/PersonalizationTabs";
import { SignInGate } from "@/components/auth/SignInGate";
import { getAllArchiveCircuits, getAllArchiveDrivers, getAllArchiveTeams, getArchiveTeamHomeCircuits } from "@/lib/supabase/archive";
import { getCurrentEntrants, getRacesByYear } from "@/lib/supabase/races";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { safeRead } from "@/lib/safeRead";
import { archiveSlugForCurrentTeam, teamSlug } from "@/lib/teamSlug";
import { getUserProfile } from "@/lib/supabase/users";
import { archiveCircuitHref, archiveDriverHref, archiveTeamHref, groupHref } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";
import { getCurrentSeason } from "@/lib/currentSeason";
import { pageMetadata } from "@/lib/seo";
import { EYEBROW } from "@/components/ui/panel";
import { NotificationsForm } from "@/components/profile/NotificationsForm";
import { ACCOUNT_SECTIONS, AccountNav, accountHref, type AccountSection } from "./components/AccountNav";
import { ProfileDetailsForm } from "./components/ProfileDetailsForm";
import { AccountData } from "./components/AccountData";
import { ProfileOverview, type ProfileOverviewData } from "./components/ProfileOverview";
import { getPointsBalance, listRecentTransactions } from "@/lib/supabase/points";
import { getUserGroups } from "@/lib/supabase/groups";
import { getUserPicksForYear } from "@/lib/supabase/picks";
import { computePredictionPerformance } from "@/lib/predictionPerformance";
import { getNotificationPrefs } from "@/lib/supabase/notifications";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { parseUtcDateTime } from "@/lib/countdown";

const VALID_TABS: Tab[] = ["players", "teams", "circuits"];

/** Same aliasing as archiveSlugForCurrentTeam, but for display: a driver's Companies list
 * should say "Red Bull" for every year they drove there, not "Red Bull, Red Bull Racing" just
 * because this year's data uses the live season's own name for it. */
function canonicalTeamName(rawName: string, teamItems: FavoriteEntity[]): string {
  const slug = archiveSlugForCurrentTeam(rawName);
  return teamItems.find((t) => t.id === slug)?.name ?? rawName;
}

/** The archive only covers seasons through last year by design (this one isn't over yet, so it's
 * never "archived") — but someone personalizing today obviously wants this year's names pickable
 * too. Merges the current season's entrants/teams/circuits into the archive-sourced lists: an
 * exact name (or, for teams, slug) match updates that existing row's year span/race count in
 * place; anything genuinely new this season (a rookie, a new entrant) becomes its own row. */
async function mergeCurrentSeason(
  driverItems: FavoriteEntity[],
  teamItems: FavoriteEntity[],
  circuitItems: FavoriteEntity[],
  circuitLocalities: Map<string, string>,
) {
  const year = await getCurrentSeason(); // from the calendar, not the clock (R-22)
  const [races, entrants] = await Promise.all([getRacesByYear(year), getCurrentEntrants(year)]);
  const completed = races.filter((r) => r.status === "completed");

  const driverStats = new Map<string, { name: string; raceCount: number; teams: Set<string> }>();
  const teamStats = new Map<string, { name: string; raceCount: number }>();
  for (const race of completed) {
    const teamsThisRace = new Set<string>();
    for (const result of race.results ?? []) {
      const d = driverStats.get(result.driver) ?? { name: result.driverName, raceCount: 0, teams: new Set() };
      d.raceCount += 1;
      d.teams.add(canonicalTeamName(result.team, teamItems));
      driverStats.set(result.driver, d);

      teamsThisRace.add(result.team);
    }
    for (const team of teamsThisRace) {
      const t = teamStats.get(team) ?? { name: team, raceCount: 0 };
      t.raceCount += 1;
      teamStats.set(team, t);
    }
  }
  for (const e of entrants) {
    if (!driverStats.has(e.driver)) {
      driverStats.set(e.driver, { name: e.driverName, raceCount: 0, teams: new Set([canonicalTeamName(e.team, teamItems)]) });
    }
    if (!teamStats.has(e.team)) teamStats.set(e.team, { name: e.team, raceCount: 0 });
  }

  const circuitRaceCount = new Map<string, number>();
  for (const race of completed) circuitRaceCount.set(race.circuit, (circuitRaceCount.get(race.circuit) ?? 0) + 1);

  const driversByName = new Map(driverItems.map((d) => [d.name.trim().toLowerCase(), d]));
  for (const [code, stats] of driverStats) {
    const existing = driversByName.get(stats.name.trim().toLowerCase());
    if (existing) {
      existing.lastYear = year;
      existing.raceCount += stats.raceCount;
      existing.extra = [...new Set([...(existing.extra ? existing.extra.split(", ") : []), ...stats.teams])].join(", ");
    } else {
      const item: FavoriteEntity = {
        id: code,
        name: stats.name,
        firstYear: year,
        lastYear: year,
        raceCount: stats.raceCount,
        extra: [...stats.teams].join(", "),
        href: archiveDriverHref(code),
      };
      driverItems.push(item);
      driversByName.set(stats.name.trim().toLowerCase(), item);
    }
  }

  // Home circuit (this team's most-raced circuit historically) is archive-derived and doesn't
  // need updating from one extra current-season race — only year span/race count change here.
  const teamsBySlug = new Map(teamItems.map((t) => [t.id, t]));
  for (const [name, stats] of teamStats) {
    const slug = archiveSlugForCurrentTeam(name);
    const existing = teamsBySlug.get(slug);
    if (existing) {
      existing.lastYear = year;
      existing.raceCount += stats.raceCount;
    } else {
      const item: FavoriteEntity = {
        id: slug,
        name,
        firstYear: year,
        lastYear: year,
        raceCount: stats.raceCount,
        extra: "",
        href: archiveTeamHref(slug),
      };
      teamItems.push(item);
      teamsBySlug.set(slug, item);
    }
  }

  const circuitsById = new Map(circuitItems.map((c) => [c.id, c]));
  const circuitsByName = new Map(circuitItems.map((c) => [c.name.trim().toLowerCase(), c]));
  const circuitIdsByName = new Map(circuitItems.map((c) => [c.name.trim().toLowerCase(), c.id]));
  for (const [location, raceCount] of circuitRaceCount) {
    const key = location.trim().toLowerCase();
    const resolvedId = resolveCurrentCircuitToArchiveId(location, circuitLocalities, circuitIdsByName);
    const existing = (resolvedId ? circuitsById.get(resolvedId) : undefined) ?? circuitsByName.get(key);
    if (existing) {
      existing.lastYear = year;
      existing.raceCount += raceCount;
    } else {
      const id = teamSlug(location);
      const item: FavoriteEntity = {
        id,
        name: location,
        firstYear: year,
        lastYear: year,
        raceCount,
        extra: "",
        href: archiveCircuitHref(id),
      };
      circuitItems.push(item);
      circuitsById.set(id, item);
      circuitsByName.set(location.trim().toLowerCase(), item);
    }
  }
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ tab?: string }> }): Promise<Metadata> {
  const section = sectionOf((await searchParams).tab);
  const meta: Record<AccountSection, { title: string; description: string }> = {
    personalisation: { title: "Personalisation", description: "Your favourite drivers, teams and circuits, current and historical." },
    notifications: { title: "Notifications", description: "Choose when Apex F1 Hub emails you: before qualifying, and when results are in." },
    profile: { title: "Profile", description: "Your name on Apex F1 Hub." },
    account: { title: "Account", description: "Download your data or delete your Apex F1 Hub account." },
  };
  return pageMetadata({ ...meta[section], path: accountHref(section), index: false });
}

function sectionOf(value: string | undefined): AccountSection {
  return ACCOUNT_SECTIONS.some((s) => s.value === value) ? (value as AccountSection) : "personalisation";
}

const INTRO: Record<AccountSection, string> = {
  personalisation: "Favourite any driver, team or circuit, current or historical. Favourites come first everywhere on the site.",
  notifications: "What Apex F1 Hub tells you about, on the site and by email.",
  profile: "How you appear to everyone else.",
  account: "Your data: a copy of it, how it's used, and deleting your account.",
};

/**
 * The account, in one place: personalisation, notifications and the profile, as sections of one page
 * (`/?section=profile&tab=`), each with the site's eyebrow title and its content on the glass panel. Every link into the
 * account (the header menu, old `/profile/edit` and `/profile/notifications` links) lands here.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string }> }) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-content py-6">
        <SignInGate label="your account" />
      </div>
    );
  }
  const { tab: rawSection, kind: tab } = await searchParams;
  const section = sectionOf(rawSection);
  const title = ACCOUNT_SECTIONS.find((s) => s.value === section)!.label;

  return (
    <div className="page-content py-8">
      <p className={EYEBROW}>Account</p>
      <h1 className="mt-1 text-display-md text-primary">{title}</h1>
      <p className="mt-2 max-w-2xl text-body-sm text-secondary">{INTRO[section]}</p>
      <div className="mt-6">
        <AccountNav current={section} />
      </div>
      <div className="mt-6">
        {section === "personalisation" && <Personalisation uid={session.uid} tab={tab} />}
        {section === "notifications" && <Notifications uid={session.uid} />}
        {section === "profile" && <ProfileSection uid={session.uid} />}
        {section === "account" && <AccountData />}
      </div>
    </div>
  );
}

const POINTS_REASON: Record<string, string> = {
  starting_grant: "Welcome grant",
  prediction_entry: "Entered a prediction round",
  prediction_payout: "Prediction round won",
  prediction_refund: "Prediction round refunded",
};

/** The Profile section: who you are (editable) and account actions on the left; this season, favourites and
 * communities on the right. Every read degrades to its empty state rather than failing the page. */
async function ProfileSection({ uid }: { uid: string }) {
  const season = await getCurrentSeason();
  const [profile, points, recent, groups, picks, races, drivers, teams, circuits] = await Promise.all([
    safeRead(() => getUserProfile(uid), null),
    safeRead(() => getPointsBalance(uid), null),
    safeRead(() => listRecentTransactions(uid, 5), []),
    safeRead(() => getUserGroups(uid), []),
    safeRead(() => getUserPicksForYear(uid, season), []),
    safeRead(() => getRacesByYear(season), []),
    safeRead(() => getAllArchiveDrivers(), []),
    safeRead(() => getAllArchiveTeams(), []),
    safeRead(() => getAllArchiveCircuits(), []),
  ]);
  const perf = computePredictionPerformance(picks, races);
  const names = <T,>(ids: string[] | undefined, list: T[], id: (x: T) => string, name: (x: T) => string, href: (id: string) => string) => {
    const all = ids ?? [];
    const byId = new Map(list.map((x) => [id(x), name(x)]));
    return { total: all.length, items: all.slice(0, 6).map((i) => ({ name: byId.get(i) ?? i, href: href(i) })) };
  };
  const data: ProfileOverviewData = {
    memberSince: profile?.createdAt ?? new Date().toISOString(),
    role: profile?.role ?? null,
    points,
    season,
    record: {
      scoredRaces: perf.points.races,
      pointsEarned: perf.points.earned,
      winner: perf.winner,
      podium: perf.podiumSlots,
    },
    recentPoints: recent.map((t) => ({ amount: t.amount, label: POINTS_REASON[t.reason] ?? t.reason, at: t.createdAt })),
    favourites: [
      { kind: "Drivers", ...names(profile?.favoriteDrivers, drivers, (d) => d.driverId, (d) => d.name, archiveDriverHref) },
      { kind: "Teams", ...names(profile?.favoriteTeams, teams, (t) => t.teamId, (t) => t.name, archiveTeamHref) },
      { kind: "Circuits", ...names(profile?.favoriteTracks, circuits, (c) => c.circuitId, (c) => c.name ?? c.circuitId, archiveCircuitHref) },
    ],
    communities: groups.map((g) => ({ id: g.id, name: g.name, avatarUrl: g.avatarUrl, role: g.myRole, href: groupHref(g.id) })),
  };
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ProfileDetailsForm
        initial={{ firstName: profile?.firstName ?? "", lastName: profile?.lastName ?? "", username: profile?.username ?? null, memberSince: data.memberSince, role: data.role }}
      />
      <ProfileOverview data={data} />
    </div>
  );
}

async function Notifications({ uid }: { uid: string }) {
  const season = await getCurrentSeason();
  const [profile, prefs, groups, calendar] = await Promise.all([
    safeRead(() => getUserProfile(uid), null),
    safeRead(() => getNotificationPrefs(uid), {}),
    safeRead(() => getUserGroups(uid), []),
    safeRead(() => getCalendarEntriesByYear(season), []),
  ]);
  // The next qualifying session still to start: when this weekend's picks and rounds lock.
  // eslint-disable-next-line react-hooks/purity -- a server render: "now" is the request's time.
  const now = Date.now();
  const next = calendar
    .flatMap((e) => e.sessions.filter((x) => /^qualifying$/i.test(x.label)).map((x) => ({ raceName: e.name ?? "Next race", startsAt: x.date })))
    .filter((x) => parseUtcDateTime(x.startsAt).getTime() > now)
    .sort((a, b) => parseUtcDateTime(a.startsAt).getTime() - parseUtcDateTime(b.startsAt).getTime())[0] ?? null;
  return (
    <NotificationsForm
      initialPrefs={prefs}
      initialNotifyBeforeQualifying={profile?.notifyBeforeQualifying}
      initialNotifyOnResults={profile?.notifyOnResults}
      email={profile?.email ?? null}
      moderates={groups.filter((g) => g.myRole !== "member").length}
      nextQualifying={next}
    />
  );
}

async function Personalisation({ uid, tab }: { uid: string; tab?: string }) {
  const initialTab: Tab = VALID_TABS.includes(tab as Tab) ? (tab as Tab) : "players";
  // A Firestore outage (quota, transient error, anything) degrades this page to empty tabs
  // instead of crashing it outright — same reasoning as archive/page.tsx's ArchiveIndex.
  const [profile, drivers, teams, circuits, teamHomeCircuits] = await Promise.all([
    safeRead(() => getUserProfile(uid), null),
    safeRead(() => getAllArchiveDrivers(), []),
    safeRead(() => getAllArchiveTeams(), []),
    safeRead(() => getAllArchiveCircuits(), []),
    safeRead(() => getArchiveTeamHomeCircuits(), {}),
  ]);

  // One list per entity type, spanning the full archive (1950-last year) plus this year's own
  // season (merged in below) — not just this year's grid alone — so a fan of a retired driver or
  // a long-gone team can still find and favorite them, and this year's names show up too. Same
  // favoriteDrivers/Teams/Tracks arrays the archive's own heart icons and signup's quick pick
  // both write into; there's no second copy of this data anywhere.
  const driverItems: FavoriteEntity[] = drivers.map((d) => ({
    id: d.driverId,
    name: d.name,
    firstYear: d.firstYear,
    lastYear: d.lastYear,
    raceCount: d.raceCount,
    extra: d.constructors?.join(", ") ?? "",
    href: archiveDriverHref(d.driverId),
  }));
  const teamItems: FavoriteEntity[] = teams.map((t) => ({
    id: t.teamId,
    name: t.name,
    firstYear: t.firstYear,
    lastYear: t.lastYear,
    raceCount: t.raceCount,
    extra: teamHomeCircuits[t.teamId] ?? "",
    href: archiveTeamHref(t.teamId),
  }));
  const circuitItems: FavoriteEntity[] = circuits.map((c) => ({
    id: c.circuitId,
    name: c.name ?? c.circuitId,
    firstYear: c.firstYear ?? 0,
    lastYear: c.lastYear ?? 0,
    raceCount: c.raceCount ?? 0,
    extra: c.country ?? "",
    href: archiveCircuitHref(c.circuitId),
  }));
  const circuitLocalities = new Map(circuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));

  // Best-effort: if the current season's own data can't be read right now, the page still shows
  // the full archive-only lists rather than crashing over one extra merge step.
  try {
    await mergeCurrentSeason(driverItems, teamItems, circuitItems, circuitLocalities);
  } catch (error) {
    console.error("ProfilePage: current-season merge failed, showing archive-only data:", error);
  }

  return (
    <PersonalizationTabs
      initialTab={initialTab}
      players={{ items: driverItems, favoriteIds: profile?.favoriteDrivers ?? [] }}
      teams={{ items: teamItems, favoriteIds: profile?.favoriteTeams ?? [] }}
      circuits={{ items: circuitItems, favoriteIds: profile?.favoriteTracks ?? [] }}
    />
  );
}
