// One shared density convention for every homepage block whose content count varies with user
// activity (Recent Activity, Community's post list, Prediction Intelligence, Track Intelligence's
// favorites block) - replacing several independently-invented "is this sparse" conditions with one
// small shared rule, so a light-activity account's homepage doesn't alternate between full,
// promised-but-empty sections and near-empty ones section-to-section. Never hides or invents
// content - purely which layout treatment the same real entries get.

export type ActivityDensity = "empty" | "compact-inline" | "compact-stacked" | "full";

/** 0 -> caller should render nothing (already correct everywhere via an early `return null`, this
 * function is mostly documentation for that case). 1 -> a single compact inline row, no section
 * heading chrome. 2-3 -> compact stacked rows, one small label. 4+ -> today's full layout. */
export function activityDensity(count: number): ActivityDensity {
  if (count <= 0) return "empty";
  if (count === 1) return "compact-inline";
  if (count <= 3) return "compact-stacked";
  return "full";
}
