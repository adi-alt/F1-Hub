/** Parses the display strings this app's own pipeline already formats (see
 * pipeline/ergast_utils.py's format_timedelta: "1:21.412", "1:35:44.101", "+24.065") back into
 * seconds, for charts that need a real number — not a general-purpose time parser.
 *
 * Deliberately only used on values that are genuinely comparable on one scale (qualifying times:
 * every entry is a real lap time; pit stop durations don't need this at all, already stored as
 * raw numbers). Race results' `time` field is NOT parsed anywhere — a car classified "+2 Laps"
 * isn't comparable in seconds to one that's "+24.065s" without knowing that lap's actual time, so
 * no chart anywhere treats results' time as one numeric scale. */
export function parseTimeToSeconds(time: string | null | undefined): number | null {
  if (!time) return null;
  // The leading "+" on a gap doesn't change the numeric value, only how it'd be re-displayed.
  const parts = time.replace(/^\+/, "").split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}
