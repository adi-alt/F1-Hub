"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/providers/AuthProvider";

const OPEN_SEARCH_EVENT = "apex:open-search";

// The palette itself (results, actions, Ask Apex) is its own chunk, fetched the first time it opens, so it adds
// nothing to every page's JavaScript but this listener.
const PaletteDialog = dynamic(() => import("./PaletteDialog").then((m) => m.PaletteDialog), { ssr: false });

/** The header's search button: the palette for touch and mouse users, who have no ⌘K. */
export function SearchButton() {
  return <Button variant="ghost" size="sm" iconOnly iconStart={Search} aria-label="Search (⌘K)" aria-keyshortcuts="Meta+K Control+K" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} />;
}

/**
 * ⌘K / Ctrl+K command palette (audit R-55): search, actions and Ask Apex. Signed-in only, like the rest of the site.
 * This shell only listens for the shortcut; PaletteDialog loads on first open.
 */
export function CommandPalette() {
  const { isAuthorized, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLoaded(true);
        setOpen((v) => !v);
      }
    };
    const onOpen = () => {
      setLoaded(true);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  if (!isAuthorized || !user || !loaded) return null;
  return <PaletteDialog open={open} onClose={() => setOpen(false)} uid={user.uid} />;
}
