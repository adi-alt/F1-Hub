import { Skeleton } from "@/components/ui/Skeleton";

/** Mirrors DriverStandingsTable/ConstructorStandingsTable's real column shape exactly (down to
 * the avatar) so there's no visible jump once real rows paint in — the whole point of a skeleton
 * that isn't just a gray rectangle. `hasTeamColumn` distinguishes the two real tables: drivers
 * show driver+team as separate columns, constructors only have the one entity column. */
export function StandingsTableSkeleton({
  rows = 10,
  hasTeamColumn = true,
  avatarShape = "circle",
}: {
  rows?: number;
  hasTeamColumn?: boolean;
  avatarShape?: "circle" | "square";
}) {
  const avatarClass = avatarShape === "circle" ? "rounded-full" : "rounded-lg";
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
      <div className="flex items-center justify-end border-b border-[var(--f1-line)] bg-[var(--f1-carbon)] px-2 py-1">
        <Skeleton className="h-7 w-7 rounded-full" />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[var(--f1-carbon)] text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3">
              <Skeleton className="h-3 w-6" />
            </th>
            <th className="px-4 py-3">
              <Skeleton className="h-3 w-16" />
            </th>
            {hasTeamColumn && (
              <th className="px-4 py-3">
                <Skeleton className="h-3 w-14" />
              </th>
            )}
            <th className="px-4 py-3 text-right">
              <Skeleton className="ml-auto h-3 w-10" />
            </th>
            <th className="px-4 py-3 text-right">
              <Skeleton className="ml-auto h-3 w-14" />
            </th>
            <th className="px-4 py-3 text-right">
              <Skeleton className="ml-auto h-3 w-12" />
            </th>
            <th className="px-4 py-3 text-right">
              <Skeleton className="ml-auto h-3 w-8" />
            </th>
            <th className="w-10 px-4 py-3 text-center">
              <Skeleton className="mx-auto h-3 w-6" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--f1-line)]">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-2.5">
                <Skeleton className="h-4 w-4" />
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Skeleton className={`h-8 w-8 shrink-0 ${avatarClass}`} />
                  <Skeleton className="h-4 w-28" />
                </div>
              </td>
              {hasTeamColumn && (
                <td className="px-4 py-2.5">
                  <Skeleton className="h-4 w-24" />
                </td>
              )}
              <td className="px-4 py-2.5 text-right">
                <Skeleton className="ml-auto h-4 w-6" />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Skeleton className="ml-auto h-4 w-6" />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Skeleton className="ml-auto h-4 w-8" />
              </td>
              <td className="px-4 py-2.5 text-right">
                <Skeleton className="ml-auto h-4 w-6" />
              </td>
              <td className="px-4 py-2.5 text-center">
                <Skeleton className="mx-auto h-5 w-5 rounded-full" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
