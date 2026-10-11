"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sheet } from "@/components/ui/Dialog";
import { navSectionFor, type NavSection } from "@/lib/navSections";
import { seasonHref } from "@/lib/routes";

const baseLinks = (season: number): { href: string; label: string; section: NavSection }[] => [
  { href: seasonHref(season), label: "Season", section: "season" },
  { href: "/circuits", label: "Circuits", section: "circuits" },
  { href: "/archive", label: "Archive", section: "archive" },
  { href: "/groups", label: "Communities", section: "communities" },
];

export function MobileNav({
  season,
  showUsers = false,
  showModels = false,
  showNav = false,
}: {
  season: number;
  showUsers?: boolean;
  showModels?: boolean;
  showNav?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const links = [
    ...baseLinks(season),
    ...(showUsers ? [{ href: "/users", label: "Users", section: "users" as const }] : []),
    ...(showModels ? [{ href: "/models", label: "Models", section: "models" as const }] : []),
  ];
  const activeSection = navSectionFor(usePathname());

  if (!showNav) return null;

  return (
    <div className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex size-9 items-center justify-center rounded-full border border-[var(--f1-line)] text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Menu aria-hidden size={20} strokeWidth={1.75} />
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
