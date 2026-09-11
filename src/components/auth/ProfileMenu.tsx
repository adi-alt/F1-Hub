"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/providers/AuthProvider";
import { StarIcon, SlidersIcon, BellIcon, PencilIcon, LogOutIcon } from "@/components/icons/HomeIcons";

const ITEMS = [
  { href: "/profile?section=personalisation", label: "Personalisation", icon: SlidersIcon },
  { href: "/profile/notifications", label: "Notifications", icon: BellIcon },
  { href: "/profile/edit", label: "Edit profile", icon: PencilIcon },
];

// The panel's actual frosted look - a real translucent dark glass (~50% tint, not glass-surface's
// ~93-95% opaque gradient, which reads as a flat zinc slab at this small a size) plus a strong
// blur+saturate so blurred page color genuinely shows through. Declared once and reused by both
// the panel and its tail via inline style + `inherit` below, so they're guaranteed to render as
// one continuous surface rather than two independently-tuned blurs that can drift out of sync.
const FROSTED_STYLE = {
  backgroundColor: "rgba(22, 22, 26, 0.5)",
  backdropFilter: "blur(32px) saturate(160%)",
  WebkitBackdropFilter: "blur(32px) saturate(160%)",
  borderColor: "rgba(255, 255, 255, 0.16)",
} as const;

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
                {/* One shape, not two: the tail is a child of the SAME element that carries the
                    real background/blur/border (below), and copies every one of those via CSS
                    `inherit` rather than a hand-matched duplicate - so it can never drift out of
                    sync with the panel, and the two read as one continuous frosted surface with
                    no seam. It sits near the actual top-right corner (not centered) since that's
                    where the trigger button it points back to actually is. */}
                <div className="relative rounded-xl border shadow-2xl shadow-black/50" style={FROSTED_STYLE}>
                  <div
                    className="absolute -top-[7px] right-4 h-3.5 w-3.5 rotate-45 rounded-[2px] border"
                    style={{
                      backgroundColor: "inherit",
                      backdropFilter: "inherit",
                      WebkitBackdropFilter: "inherit",
                      borderColor: "inherit",
                    }}
                  />
                  <div className="relative overflow-hidden rounded-xl">
                    <nav className="p-1.5">
                      {ITEMS.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-neutral-500" />
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
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
                      >
                        <LogOutIcon className="h-4 w-4 shrink-0 text-neutral-500" />
                        Log out
                      </button>
                    </div>
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
