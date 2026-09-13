"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/** String-valued sibling of useUrlPage.ts - same read-once-at-mount + router.replace pattern,
 * generalized to any single query param (search text, sort key, an era/status filter id) instead
 * of just `page`. The param is omitted entirely from the URL when its value equals `defaultValue`,
 * same "don't clutter the URL with the default state" rule useUrlPage already follows for page=1. */
export function useUrlParam(key: string, defaultValue = ""): [string, (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValueState] = useState(() => searchParams.get(key) ?? defaultValue);

  function setValue(next: string) {
    setValueState(next);
    const params = new URLSearchParams(searchParams);
    if (next === defaultValue || next === "") params.delete(key);
    else params.set(key, next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return [value, setValue];
}
