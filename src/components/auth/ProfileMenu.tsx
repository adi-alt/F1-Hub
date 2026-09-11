"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/providers/AuthProvider";

const ITEMS = [
  { href: "/profile?section=personalisation", label: "Personalisation" },
  { href: "/profile/notifications", label: "Notifications" },
  { href: "/profile/edit", label: "Edit profile" },
];

// ponytail: inline instead of pulling in an icon package for one glyph (path lifted from Lucide's
// "star" icon - a properly regular 5-point star instead of the hand-drawn one this replaces).
function StarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
    </svg>
  );
}

type Rect = { top: number; right: number };

export function ProfileMenu() {
  const { user, displayName, isAuthorized, signOut, pointsBalance } = useAuth();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Portaled to document.body below (see the dropdown itself) - the header this button lives in
  // has its own backdrop-blur, and Chromium/WebKit scope a descendant's backdrop-filter sampling
  // to the nearest ancestor that also has one ("backdrop root"), so a menu left as a DOM child of
  // <header> can only ever blur the header's own layer, never the page content it visually
  // overlaps below the header's bottom edge - confirmed live (screenshot showed the dropdown's
  // background fully sharp, not frosted, despite computed style correctly reporting
  // backdrop-filter: blur(24px)). Portaling escapes that root entirely, the same fix
  // SearchableSelect/ArchiveSeasonGrid already use for their own floating panels, just for a
  // different underlying reason there (scroll-clipping, not backdrop-filter scoping).
  function updatePosition() {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 8, right: window.innerWidth - r.right });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  // Not useOnClickOutside (src/hooks) - that only checks one ref, and the dropdown itself lives
  // outside rootRef in the DOM once portaled, so a click on a menu item would otherwise register
  // as "outside" and close the menu before the item's own onClick/navigation ever fires.
  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

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
        className="flex items-center gap-2 rounded-xl border border-white/10 px-2 py-1.5 text-sm text-neutral-200 transition hover:border-white/20 hover:bg-white/5"
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
            <StarIcon className="h-3 w-3 text-neutral-500" />
            <span className="font-mono">{pointsBalance}</span> pts
          </span>
        )}
      </button>

      {rect &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="profile-menu"
                ref={dropdownRef}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ position: "fixed", top: rect.top, right: rect.right }}
                className="z-[200] w-56"
              >
                {/* Tail pointing back up at the trigger button - same glass tint/blur as the panel
                    so it reads as one continuous shape, not a pasted-on triangle. */}
                <div className="absolute -top-1.5 right-5 h-3 w-3 rotate-45 border-l border-t border-white/[0.14] bg-[rgba(31,31,36,0.95)] backdrop-blur-xl" />
                <div className="glass-surface relative overflow-hidden rounded-xl">
                  <nav className="p-1.5">
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
                  <div className="border-t border-white/10 p-1.5">
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
