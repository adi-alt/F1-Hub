import { Skeleton } from "./Skeleton";

/** The capsule tab-bar shape shared by personalization's and archive's tab switchers — a
 * bordered pill track holding one skeleton pill per real tab, sized roughly to that tab's own
 * label width so the loading state doesn't visibly jump once the real tabs paint in. */
export function TabBarSkeleton({ labels }: { labels: string[] }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1 rounded-full border border-[var(--f1-line)] bg-black/20 p-1">
        {labels.map((label, i) => (
          <Skeleton key={label} className={`h-8 rounded-full ${i === 0 ? "w-20" : "w-24"}`} />
        ))}
      </div>
      <Skeleton className="h-8 w-56 rounded-full" />
    </div>
  );
}

/** Row shape shared by personalization's FavoriteEntityList and archive's driver/team tables:
 * S.No, name, races, years, extra, favorite. No entrance animation here (a skeleton is a loading
 * placeholder, not content worth revealing) - the real rows that replace it use their own stagger
 * once they load. */
export function TableRowsSkeleton({ rows = 11 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--f1-line)]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--f1-line)] bg-[var(--f1-carbon)]">
          <tr>
            <th className="w-12 px-4 py-2.5">
              <Skeleton className="h-3 w-5" />
            </th>
            <th className="px-4 py-2.5">
              <Skeleton className="h-3 w-16" />
            </th>
            <th className="px-4 py-2.5 text-right">
              <Skeleton className="ml-auto h-3 w-12" />
            </th>
            <th className="px-4 py-2.5 text-right">
              <Skeleton className="ml-auto h-3 w-14" />
            </th>
            <th className="px-4 py-2.5">
              <Skeleton className="h-3 w-16" />
            </th>
            <th className="w-12 px-4 py-2.5 text-center">
              <Skeleton className="mx-auto h-3 w-6" />
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--f1-line)]">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3">
                <Skeleton className="h-3.5 w-4" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-3.5 w-32" />
              </td>
              <td className="px-4 py-3 text-right">
                <Skeleton className="ml-auto h-3.5 w-8" />
              </td>
              <td className="px-4 py-3 text-right">
                <Skeleton className="ml-auto h-3.5 w-16" />
              </td>
              <td className="px-4 py-3">
                <Skeleton className="h-3.5 w-40" />
              </td>
              <td className="px-4 py-3 text-center">
                <Skeleton className="mx-auto h-5 w-5 rounded-full" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The 3-column Prev/page-info/Next footer shape — centered page text with no button
 * placeholders either side, matching how the real footer looks on page 1 (Prev hidden). */
export function TableFooterSkeleton() {
  return (
    <div className="mt-3 grid shrink-0 grid-cols-3 items-center">
      <div />
      <Skeleton className="mx-auto h-3.5 w-40" />
      <div className="flex justify-end">
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
    </div>
  );
}
