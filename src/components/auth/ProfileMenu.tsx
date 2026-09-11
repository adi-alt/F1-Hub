"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/providers/AuthProvider";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";

const ITEMS = [
  { href: "/profile?section=personalisation", label: "Personalisation" },
  { href: "/profile/notifications", label: "Notifications" },
  { href: "/profile/edit", label: "Edit profile" },
];

// ponytail: inline instead of pulling in an icon package for one glyph
function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <path d="M10 2 12.2 7.6 18 8.4 13.8 12.3 15 18 10 15 5 18 6.2 12.3 2 8.4 7.8 7.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export function ProfileMenu() {
  const { user, displayName, isAuthorized, signOut, pointsBalance } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(rootRef, open, () => setOpen(false));

  // Only ever rendered from SignInButton's isAuthorized branch, but checked directly here too —
  // a menu implying "you're signed in" is exactly the wrong thing to show from any other caller
  // that forgets that distinction.
  if (!isAuthorized || !user) return null;

  // The profile's own firstName (session-cached) — always set by the time this renders (getting
  // here at all requires a completed profile), email is just the last-resort fallback.
  const name = displayName ?? user.email ?? "Account";

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Profile menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/10 py-1 pl-1 pr-3 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-white/5"
      >
        {user.photoURL ? (
          <Image src={user.photoURL} alt="" width={28} height={28} className="rounded-full" unoptimized />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--f1-red)] text-xs font-bold">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="max-w-[9rem] truncate font-medium text-white">{name}</span>
        {pointsBalance !== null && (
          <span className="flex items-center gap-1 border-l border-white/10 pl-2 text-xs font-semibold text-neutral-300">
            <Star className="h-3 w-3 text-neutral-500" aria-hidden />
            <span className="font-mono">{pointsBalance}</span> pts
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/70 shadow-xl backdrop-blur-xl"
          >
            <nav className="py-1.5 px-1.5">
              {ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t border-[var(--f1-line)] p-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  void signOut();
                }}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
              >
                Log out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
