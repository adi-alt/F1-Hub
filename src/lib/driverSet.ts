/** The one Top 5/10/All/Custom convention every driver-count filter in Race Analysis shares - one
 * filter instance per race page (lifted to each dashboard), driving Qualifying, Strategy, Lap
 * Progression, and Race Performance together. Lives here, not in any one component, so Season and
 * Archive's otherwise-separate component trees can share the same type without reaching into each
 * other's directories. */
export type DriverSet = "top5" | "top10" | "all" | "custom";

/** Every panel already produces its own correctly-ordered list (Qualifying by grid, Strategy/Lap
 * Progression/Race Performance by finishing position - each panel's own real convention, never
 * forced to match another's) before calling this - "top5"/"top10" just take a prefix of that
 * order, "all" keeps it, "custom" filters down to whatever the shared driver picker selected
 * (order-preserving, not re-sorted to selection order). `idOf` is deliberately a parameter, not a
 * fixed field name - Archive keys by `driverId` (Ergast's slug id), Season by `driver` (the
 * 3-letter code), and both are already what each panel's own ordered list is built from. */
export function filterDriverSet<T>(items: T[], driverSet: DriverSet, idOf: (item: T) => string, customIds: string[]): T[] {
  if (driverSet === "custom") {
    const selected = new Set(customIds);
    return items.filter((item) => selected.has(idOf(item)));
  }
  if (driverSet === "all") return items;
  return items.slice(0, driverSet === "top5" ? 5 : 10);
}
