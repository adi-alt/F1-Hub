/** The one Top 5/10/All convention every driver-count filter on the race page shares (Session
 * Analysis' shared Qualifying+Strategy filter, LapChart's own Top 5/10/All/Custom). Lives here,
 * not in any one component, so Season and Archive's otherwise-separate component trees can share
 * the same type without reaching into each other's directories. */
export type DriverSet = "top5" | "top10" | "all";

export function driverSetCount(driverSet: DriverSet): number | null {
  if (driverSet === "top5") return 5;
  if (driverSet === "top10") return 10;
  return null; // "all" - caller keeps the full list
}
