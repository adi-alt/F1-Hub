"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
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
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle menu"
        aria-expanded={open}
        className="relative z-50 flex h-9 w-9 flex-col items-center justify-center gap-1.5 rounded-full border border-[var(--f1-line)]"
      >
        <motion.span
          animate={{ rotate: open ? 45 : 0, y: open ? 6 : 0 }}
          transition={{ duration: 0.2 }}
          className="h-0.5 w-4 bg-white"
        />
        <motion.span
          animate={{ opacity: open ? 0 : 1 }}
          transition={{ duration: 0.15 }}
          className="h-0.5 w-4 bg-white"
        />
        <motion.span
          animate={{ rotate: open ? -45 : 0, y: open ? -6 : 0 }}
          transition={{ duration: 0.2 }}
          className="h-0.5 w-4 bg-white"
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-x-0 top-full border-b border-[var(--f1-line)] bg-[var(--f1-carbon)] px-4 py-2 shadow-xl"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={link.section === activeSection ? "page" : undefined}
                className={`block rounded-lg px-2 py-2.5 text-sm font-medium transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  link.section === activeSection ? "bg-white/5 text-white" : "text-neutral-300"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
