"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * Where the browser is: `key` changes on every navigation (path and query), `appPath` is the page's path and `params`
 * the query. For components that used to branch on usePathname().
 */
export function useAppLocation() {
  const pathname = usePathname();
  const params = useSearchParams();
  return { pathname, params, appPath: pathname ?? "/", key: `${pathname}?${params?.toString() ?? ""}` };
}
