import type { RaceSummary } from "@/app/season/_service/season.pure";

/** A round's own visual status - distinct from RaceSummary.state, which only ever says
 * completed/next/upcoming and has no notion of "the weekend has started but isn't classified yet"
 * (that's weekendStatus === "live"). A live weekend gets the same focal treatment as "next" - both
 * are "the thing happening right now" from a glance at the season, not two different concepts. */
export type NodeStatus = "completed" | "current" | "upcoming";

export function nodeStatus(race: RaceSummary): NodeStatus {
  if (race.state === "next" || race.weekendStatus === "live") return "current";
  if (race.state === "completed") return "completed";
  return "upcoming";
}
