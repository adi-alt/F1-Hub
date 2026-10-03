import { Skeleton } from "@/components/ui/LegacySkeleton";
import { SectionLoadingMessage } from "@/components/ui/SectionLoadingMessage";

/** Mirrors UserManagement's real layout — the card, its one control row, and the table — so the
 * page doesn't visibly re-flow the moment the profiles query lands. Static, not animated in: a
 * loading state that animates itself reads as flicker, not polish (same reasoning as every other
 * loading.tsx here). Every placeholder here is the real control's own shape and height (h-9
 * rounded rectangles across that row), so this has to move whenever that row does. */
export default function UsersLoading() {
  return (
    <div className="page-content py-10">
      <SectionLoadingMessage label="Checking the paddock pass list…" />
      <Skeleton className="h-9 w-32" />
      <Skeleton className="mt-2 h-4 w-72" />

      <div className="mt-8 space-y-5">
        <div className="overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/50">
          <div className="flex flex-col gap-4 border-b border-[var(--f1-line)] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <Skeleton className="h-6 w-32" />
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-9 w-72 rounded-lg" />
              <Skeleton className="h-9 w-56 rounded-lg" />
              <Skeleton className="h-9 w-24 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>

          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-white/[0.08]">
              <tr>
                {["User", "Email", "Status", "Role", "Joined"].map((label) => (
                  <th key={label} className="px-4 py-3 text-left">
                    <Skeleton className="h-3 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--f1-line)]">
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Skeleton className="h-3.5 w-40" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-24 rounded-md" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-8 w-32 rounded-lg" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-3.5 w-24" /></td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      </div>
    </div>
  );
}
