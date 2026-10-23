import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { buildIcs } from "@/lib/ics";
import { raceHref, seasonHref } from "@/lib/routes";
import { SITE_URL } from "@/lib/seo";

/**
 * GET /api/calendar/ics?year=2026[&round=20] - the season's (or one race weekend's) sessions as an .ics file, for
 * "Add to calendar" (audit R-54). From calendar.sessions, the same schedule the pages show. Signed-in only, like the
 * pages it comes from.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Sign in to export the calendar." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year"));
  const round = params.get("round") === null ? null : Number(params.get("round"));
  if (!Number.isInteger(year) || year < 1950 || year > 2100 || (round !== null && (!Number.isInteger(round) || round < 1 || round > 40))) {
    return NextResponse.json({ error: "Give a valid year (and optionally a round)." }, { status: 400 });
  }

  const all = await getCalendarEntriesByYear(year);
  const entries = round === null ? all : all.filter((e) => e.round === round);
  if (entries.length === 0) return NextResponse.json({ error: "No such race on the calendar." }, { status: 404 });

  const one = round === null ? null : entries[0];
  const path = one ? raceHref(year, one.round, one.name ?? "") : seasonHref(year);
  const ics = buildIcs(entries, { calendarName: one ? `F1 ${year} ${one.name ?? `round ${one.round}`}` : `F1 ${year} season`, now: new Date(), url: new URL(path, SITE_URL).toString() });
  const filename = one ? `f1-${year}-round-${one.round}.ics` : `f1-${year}-season.ics`;
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
