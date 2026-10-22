import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { notifyPhotosReady } from "@/lib/notificationEvents";
import { sendRaceWeekendEmails } from "@/lib/raceWeekendEmails";

/**
 * Scheduled emails, called by GitHub Actions with the shared CRON_SECRET (as /api/admin/revalidate is):
 *   { job: "race-weekend" } - hourly (.github/workflows/email-jobs.yml): reminders before qualifying, results after the race
 *   { job: "photos-ready" } - after the weekly photo scan (.github/workflows/race-photos.yml): admins, when photos wait
 * Every email is sent once per person (notify's dedupe keys), so a retried or overlapping run sends nothing twice.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { job } = (await request.json().catch(() => ({}))) as { job?: string };
  if (job === "race-weekend") return NextResponse.json(await sendRaceWeekendEmails());
  if (job === "photos-ready") {
    const { data, error } = await supabaseAdmin.from("race_photo_candidates").select("race_id, races(name)").eq("status", "pending").limit(2000);
    if (error) throw new Error(`photos-ready: ${error.message}`);
    const byRace = new Map<string, { raceName: string; count: number }>();
    for (const row of (data ?? []) as { race_id: string; races: { name: string } | { name: string }[] | null }[]) {
      const race = Array.isArray(row.races) ? row.races[0] : row.races;
      const entry = byRace.get(row.race_id) ?? { raceName: race?.name ?? row.race_id, count: 0 };
      entry.count++;
      byRace.set(row.race_id, entry);
    }
    await notifyPhotosReady([...byRace.values()]);
    return NextResponse.json({ pending: [...byRace.values()].reduce((n, r) => n + r.count, 0) });
  }
  return NextResponse.json({ error: "Unknown job" }, { status: 400 });
}
