"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { fieldControlClass } from "@/components/ui/Field";
import { useAuth } from "@/providers/AuthProvider";
import type { SearchKind, SearchResult } from "@/lib/search";

const KIND_LABEL: Record<SearchKind, string> = { section: "Section", driver: "Driver", team: "Team", circuit: "Circuit", race: "Race", season: "Season", community: "Community" };

const OPEN_SEARCH_EVENT = "apex:open-search";

/** The header's search button: the palette for touch and mouse users, who have no ⌘K. */
export function SearchButton() {
  return <Button variant="ghost" size="sm" iconOnly iconStart={Search} aria-label="Search (⌘K)" aria-keyshortcuts="Meta+K Control+K" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} />;
}

/**
 * ⌘K / Ctrl+K site search (audit R-55). A combobox in a dialog: type to search, arrow keys move through
 * the results, Enter opens one, Escape closes. Signed-in only, like the rest of the site.
 */
export function CommandPalette() {
  const { isAuthorized } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  // Debounced, and the previous request aborted, so only the settled query is answered.
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).catch(() => null);
      const body = (await res?.json().catch(() => null)) as { results?: SearchResult[] } | null;
      if (!controller.signal.aborted) {
        setResults(body?.results ?? []);
        setActive(0);
        setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  if (!isAuthorized) return null;

  const close = () => {
    setOpen(false);
    setQuery("");
    setResults([]);
  };
  const go = (result: SearchResult) => {
    close();
    router.push(result.href);
  };
  const shown = query.trim().length < 2 ? [] : results;

  return (
    <Dialog open={open} onClose={close} title="Search Apex F1 Hub" size="lg" initialFocusRef={inputRef}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && shown[active]) {
            e.preventDefault();
            go(shown[active]);
          }
        }}
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        aria-label="Search drivers, teams, circuits, races, seasons and communities"
        placeholder="Drivers, teams, circuits, races, seasons, communities…"
        maxLength={60}
        className={`w-full ${fieldControlClass(false)}`}
      />
      <p className="sr-only" aria-live="polite">
        {query.trim().length >= 2 && !loading ? `${shown.length} result${shown.length === 1 ? "" : "s"}` : ""}
      </p>
      <ul id={listId} role="listbox" aria-label="Results" className="mt-3 max-h-[60vh] overflow-y-auto">
        {shown.map((r, i) => (
          <li
            key={`${r.kind}:${r.href}`}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(r)}
            className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-control px-3 py-2 ${i === active ? "bg-surface-3" : ""}`}
          >
            <span className="min-w-0 truncate text-body-sm text-primary">{r.label}</span>
            <span className="shrink-0 text-caption text-tertiary">{r.detail ? `${KIND_LABEL[r.kind]} · ${r.detail}` : KIND_LABEL[r.kind]}</span>
          </li>
        ))}
        {query.trim().length >= 2 && !loading && shown.length === 0 && <li className="px-3 py-2 text-body-sm text-tertiary">Nothing found.</li>}
      </ul>
      <p className="mt-3 text-caption text-tertiary">↑ ↓ to move · Enter to open · Esc to close · ⌘K or Ctrl+K anywhere</p>
    </Dialog>
  );
}
