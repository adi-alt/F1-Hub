// The palette's recent searches: per user, in this browser only (localStorage), so they never leave the device. Every
// read and write is wrapped: storage can be blocked, full or absent, and the palette must work the same without it.
import type { SearchResult } from "@/lib/searchQuery";

const MAX_RECENT = 5;
const key = (uid: string) => `apex:recent-searches:${uid}`;

type Store = Pick<Storage, "getItem" | "setItem">;
const browserStore = (): Store | null => (typeof window === "undefined" ? null : window.localStorage);

export function readRecent(uid: string, store: Store | null = browserStore()): SearchResult[] {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(key(uid)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((r): r is SearchResult => typeof r?.label === "string" && typeof r?.href === "string" && typeof r?.kind === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Puts `result` first, without a duplicate, keeping the latest few. Images and outlines aren't kept: they go stale. */
export function rememberRecent(uid: string, result: SearchResult, store: Store | null = browserStore()): void {
  const slim: SearchResult = { kind: result.kind, label: result.label, href: result.href, detail: result.detail, ...(result.external ? { external: true } : {}) };
  try {
    store?.setItem(key(uid), JSON.stringify([slim, ...readRecent(uid, store).filter((r) => r.href !== result.href)].slice(0, MAX_RECENT)));
  } catch {
    // Storage blocked or full: nothing to remember, nothing broken.
  }
}
