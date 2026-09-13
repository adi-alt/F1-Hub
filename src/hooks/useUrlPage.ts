"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** Current-page state that also lives in the URL's `page` param — refreshing, sharing, or
 * navigating back to a link keeps your place instead of resetting to page 1. Reads the initial
 * value once at mount, which is correct here specifically because the table this backs is always
 * unmounted/remounted (via a `key` change on an ancestor) whenever the surrounding tab switches —
 * a fresh mount always means a fresh (and, on a tab switch, deliberately cleared) URL to read.
 * Page 1 is never written to the URL, since it's the default there's nothing to restore. */
export function useUrlPage(): [number, (next: number) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);

  function setPage(next: number) {
    setPageState(next);
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return [page, setPage];
}
