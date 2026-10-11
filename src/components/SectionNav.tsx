"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { id: string; label: string };

const MIN_SECTIONS = 3;
const MAX_LABEL = 40;

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "section";
}

/** The page's sections, from its h2 headings: each heading's own <section id>, or the heading itself, given an
 * id when it has none. Hidden headings (an inactive tab panel, a collapsed region) are skipped. */
function scan(): { items: Item[]; targets: HTMLElement[] } {
  const main = document.getElementById("main");
  if (!main) return { items: [], targets: [] };
  const items: Item[] = [];
  const targets: HTMLElement[] = [];
  const seen = new Set<string>();
  for (const h of main.querySelectorAll<HTMLHeadingElement>("h2")) {
    if (h.closest("[role=dialog], [hidden], [aria-hidden=true]") || h.getClientRects().length === 0) continue;
    const label = (h.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    const target = (h.closest("section[id]") as HTMLElement | null) ?? h;
    if (!target.id) {
      let id = slug(label);
      while (document.getElementById(id)) id = `${id}-x`;
      target.id = id;
    }
    if (seen.has(target.id)) continue;
    seen.add(target.id);
    items.push({ id: target.id, label: label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label });
    targets.push(target);
  }
  return { items, targets };
}

/**
 * Quick navigation for long pages: a column of short marks on the right edge of the screen, one per section,
 * the current one longer and brighter. Hovering or focusing it shows the section names; clicking one scrolls
 * there. Built from each page's own h2 headings, so every page gets it without wiring, and it updates as
 * content loads. Only on screens wide enough to have room for it (lg and up), and only for pages with at
 * least three sections; it never covers content until it is hovered.
 */
export function SectionNav() {
  const pathname = usePathname();
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    let targets: HTMLElement[] = [];
    let io: IntersectionObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const rescan = () => {
      const found = scan();
      targets = found.targets;
      setItems((prev) => (prev.length === found.items.length && prev.every((p, i) => p.id === found.items[i].id && p.label === found.items[i].label) ? prev : found.items));
      io?.disconnect();
      // The section crossing a line a third of the way down the viewport is the current one.
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
          if (visible[0]) setActive((visible[0].target as HTMLElement).id);
        },
        { rootMargin: "-30% 0px -60% 0px" },
      );
      targets.forEach((t) => io!.observe(t));
    };

    rescan();
    // At the very bottom the last sections can't reach the line above, so the bottom marks the last one.
    const onScroll = () => {
      if (targets.length && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) setActive(targets[targets.length - 1].id);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Sections arrive after the first paint (client data, Suspense, tabs): rescan when the page changes.
    const main = document.getElementById("main");
    const mo = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(rescan, 250);
    });
    if (main) mo.observe(main, { childList: true, subtree: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      mo.disconnect();
      io?.disconnect();
    };
  }, [pathname]);

  if (items.length < MIN_SECTIONS) return null;

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <nav aria-label="On this page" className="group fixed right-1 top-1/2 z-popover hidden -translate-y-1/2 lg:block">
      <ul className="flex flex-col items-end gap-1 rounded-card py-2 pl-2 pr-0.5 transition-colors duration-fast group-focus-within:bg-surface-2/95 group-focus-within:shadow-overlay group-hover:bg-surface-2/95 group-hover:shadow-overlay">
        {items.map((item) => {
          const current = item.id === active;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => go(item.id)}
                aria-current={current ? "location" : undefined}
                className="flex h-6 items-center justify-end gap-3 rounded-control pl-1 pr-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span
                  className={`max-w-0 overflow-hidden whitespace-nowrap text-caption opacity-0 transition-all duration-fast group-focus-within:max-w-60 group-focus-within:opacity-100 group-hover:max-w-60 group-hover:opacity-100 ${current ? "text-primary" : "text-secondary hover:text-primary"}`}
                >
                  {item.label}
                </span>
                <span aria-hidden className={`block h-0.5 shrink-0 rounded-full transition-all duration-fast ${current ? "w-5 bg-primary" : "w-3 bg-tertiary"}`} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
