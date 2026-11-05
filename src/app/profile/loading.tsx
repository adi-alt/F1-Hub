"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/Skeleton";
import { PANEL } from "@/components/ui/panel";
import { sectionFromPathname } from "./sections";

/**
 * Skeleton fallback for the active account tab content while it loads or streams on the server.
 * The masthead identity card and tab navigation are persistently rendered by ProfileLayout.
 */
export default function ProfileLoading() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = searchParams.get("tab") || sectionFromPathname(pathname);

  return (
    <div role="status" className="skeleton-delay mt-8">
      <span className="sr-only">Loading account section</span>
      <div>
        <Skeleton shape="block" className="h-8 w-48" />
        <Skeleton shape="block" className="mt-2 h-4 max-w-md" />
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
