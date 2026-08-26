"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { seasonHref } from "@/lib/routes";

const baseLinks = [
  { href: seasonHref(2026), label: "Season" },
  { href: "/circuits", label: "Circuits" },
  { href: "/archive", label: "Archive" },
  { href: "/groups", label: "Groups" },
  { href: "/news", label: "News" },
];

export function MobileNav({
  showUsers = false,
  showModels = false,
  showNav = false,
}: {
  showUsers?: boolean;
  showModels?: boolean;
  showNav?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const links = [
    ...baseLinks,
    ...(showUsers ? [{ href: "/users", label: "Users" }] : []),
    ...(showModels ? [{ href: "/models", label: "Models" }] : []),
  ];

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
                className="block rounded-lg px-2 py-2.5 text-sm font-medium text-neutral-300 transition hover:bg-white/5 hover:text-white"
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
