"use client";

import { useState } from "react";
import Link from "next/link";

import { Menu } from "lucide-react";
import { Sheet } from "@/components/ui/Dialog";
import { useAppLocation } from "@/hooks/useAppLocation";
import { navSectionFor, type NavSection } from "@/lib/navSections";
import { seasonHref } from "@/lib/routes";

const baseLinks = (season: number): { href: string; label: string; section: NavSection }[] => [
  { href: seasonHref(season), label: "Season", section: "season" },
  { href: "/?section=circuits", label: "Circuits", section: "circuits" },
  { href: "/?section=archive", label: "Archive", section: "archive" },
  { href: "/?section=communities", label: "Communities", section: "communities" },
];

export function MobileNav({
  season,
  showUsers = false,
  showModels = false,
}: {
  season: number;
  showUsers?: boolean;
  showModels?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const links = [
    ...baseLinks(season),
    ...(showUsers ? [{ href: "/?section=users", label: "Users", section: "users" as const }] : []),
    ...(showModels ? [{ href: "/?section=models", label: "Models", section: "models" as const }] : []),
    ...(showModels ? [{ href: "/?section=photos", label: "Photos", section: "photos" as const }] : []),
  ];
  const { pathname, params } = useAppLocation();
  const activeSection = navSectionFor(pathname, params);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex size-8 items-center justify-center rounded-control border border-strong bg-surface-2 text-primary transition-colors duration-fast hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Menu aria-hidden size={18} strokeWidth={1.75} />
      </button>

      {/* A bottom sheet (spec §4.8) rather than the old drop-down, which had no focus trap and no
          Escape (audit UI-30): the Sheet moves focus in, keeps Tab inside, closes on Escape or the
          scrim, and hands focus back to the menu button. */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Menu" size="sm">
        <nav aria-label="Main">
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={link.section === activeSection ? "page" : undefined}
                  className={`block rounded-control px-3 py-3 text-body font-medium transition-colors duration-fast ease-standard hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring motion-reduce:transition-none ${
                    link.section === activeSection ? "bg-surface-2 text-primary" : "text-secondary"
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Sheet>
    </div>
  );
}
