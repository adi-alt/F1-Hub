/**
 * When the race-photo scan runs (.github/workflows/race-photos.yml), so the admin page can say when the next batch
 * of candidates arrives. Keep in step with the workflow's cron lines.
 */
export const PHOTO_SCANS = [
  { day: 6, hourUtc: 22, label: "Saturday night, after qualifying", note: "practice and qualifying photos of this weekend's race" },
  { day: 1, hourUtc: 6, label: "Monday morning", note: "race-day uploads" },
  { day: 4, hourUtc: 6, label: "Thursday morning", note: "the late trickle; each race is revisited for five weeks" },
] as const;

/** Days before a race's date to the day after it is first scanned (pipeline/race_photos.py LOOKAHEAD_DAYS). */
export const SCAN_LOOKAHEAD_DAYS = 2;
/** How long after its race date a race keeps being scanned (pipeline/race_photos.py SCAN_WINDOW_DAYS). */
export const SCAN_WINDOW_DAYS = 35;

/** The next scheduled scan strictly after `now`. */
export function nextPhotoScan(now: Date): Date {
  let best: Date | null = null;
  for (const s of PHOTO_SCANS) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), s.hourUtc));
    d.setUTCDate(d.getUTCDate() + ((s.day - d.getUTCDay() + 7) % 7));
    if (d <= now) d.setUTCDate(d.getUTCDate() + 7);
    if (!best || d < best) best = d;
  }
  return best!;
}

/** Whether the scan looks at a race with this date (YYYY-MM-DD) today. */
export function inScanWindow(raceDate: string, now: Date): boolean {
  const day = Date.parse(`${raceDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(day)) return false;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const DAY = 86_400_000;
  return day >= today - SCAN_WINDOW_DAYS * DAY && day <= today + SCAN_LOOKAHEAD_DAYS * DAY;
}
