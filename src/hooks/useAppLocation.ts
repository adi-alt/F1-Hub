"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { appPathOf } from "@/lib/sectionRoutes";

/**
 * Where the browser is, in the site's terms: `key` changes on every navigation (path and query - on the public
 * `/?section=` URLs the path alone never changes), `appPath` is the page's own folder path behind the URL ("/archive"
 * for `/?section=archive&...`), and `params` the query. For components that used to branch on usePathname().
 */
export function useAppLocation() {
  const pathname = usePathname();
  const params = useSearchParams();
  return { pathname, params, appPath: appPathOf(pathname, params), key: `${pathname}?${params?.toString() ?? ""}` };
}
