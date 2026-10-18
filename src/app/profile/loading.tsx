"use client";

import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/Skeleton";
import { PANEL } from "@/components/ui/panel";

/** The account page's own shape while it loads, for whichever section the URL names: the eyebrow, title and intro,
 * the section tabs, then that section's panel (the favourites table, the two switches, or the profile form). */
export default function ProfileLoading() {
  const section = useSearchParams().get("tab");
  return (
    <div role="status" className="page-content skeleton-delay py-8">
      <span className="sr-only">Loading your account</span>
      <Skeleton shape="block" className="h-3 w-16" />
      <Skeleton shape="block" className="mt-2 h-9 w-56" />
      <Skeleton shape="block" className="mt-3 h-4 w-full max-w-lg" />
      <div className="mt-6 flex gap-6 border-b border-white/[0.06] pb-3">
        {[112, 96, 56].map((w) => (
          <Skeleton key={w} shape="block" className="h-4" style={{ width: w }} />
        ))}
      </div>
      <div className="mt-6">
        {section === "notifications" ? (
          <div className={`max-w-xl divide-y divide-white/[0.06] ${PANEL}`}>
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <Skeleton shape="block" className="h-4 w-40" />
                  <Skeleton shape="block" className="mt-2 h-3 w-64" />
                </div>
                <Skeleton shape="block" className="h-6 w-11 rounded-full" />
              </div>
            ))}
          </div>
        ) : section === "profile" ? (
          <div className={`max-w-xl p-5 ${PANEL}`}>
            <div className="flex items-center gap-4">
              <Skeleton shape="circle" className="size-14" />
              <div>
                <Skeleton shape="block" className="h-4 w-32" />
                <Skeleton shape="block" className="mt-2 h-3 w-44" />
              </div>
            </div>
            <Skeleton shape="block" className="mt-6 h-3 w-24" />
            <Skeleton shape="block" className="mt-2 h-10 w-full" />
            <Skeleton shape="block" className="mt-6 h-8 w-28" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Skeleton shape="block" className="h-9 w-64" />
              <Skeleton shape="block" className="h-9 w-full sm:w-64" />
            </div>
            <div className={`mt-4 ${PANEL}`}>
              <Skeleton shape="block" className="m-4 h-3 w-1/3" />
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-t border-white/[0.05] px-4 py-3.5">
                  <Skeleton shape="block" className="h-3 w-6" />
                  <Skeleton shape="block" className="h-4 flex-1" />
                  <Skeleton shape="block" className="h-4 w-12" />
                  <Skeleton shape="block" className="h-4 w-20" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
