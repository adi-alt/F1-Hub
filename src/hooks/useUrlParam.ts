"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * Writes one query param into the address bar without asking the server for anything: the native
 * history API, which Next keeps in sync with useSearchParams. These params are view state the page
 * already holds (a search, a sort, a filter, a tab), so a router navigation - a full server render of
 * the page, seconds on the archive - would only make the address bar lag. Reads the live URL at the
 * moment of writing, so several writes in a row each keep the others' params.
 */
export function replaceQueryParam(key: string, value: string | null) {
  const url = new URL(window.location.href);
  if (value === null || value === "") url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, "", url);
}

/** String-valued sibling of useUrlPage.ts - read once at mount, written with replaceQueryParam. The param is omitted
 * from the URL when its value equals `defaultValue` ("don't clutter the URL with the default state"). */
export function useUrlParam(key: string, defaultValue = ""): [string, (next: string) => void] {
  const searchParams = useSearchParams();
  const [value, setValueState] = useState(() => searchParams.get(key) ?? defaultValue);

  function setValue(next: string) {
    setValueState(next);
    replaceQueryParam(key, next === defaultValue ? null : next);
  }

  return [value, setValue];
}
