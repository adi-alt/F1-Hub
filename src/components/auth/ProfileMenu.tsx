"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";
import { Bell, LifeBuoy, LogOut, Pencil, SlidersHorizontal, Sparkles, Star, Trophy } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { useProductTour } from "@/components/onboarding/ProductTour";
import { Icon } from "@/components/ui/Icon";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { ReportProblemDialog } from "@/components/ReportProblem";

const ITEMS = [
  { href: "/?section=profile&tab=personalisation", label: "Personalisation", icon: SlidersHorizontal },
  { href: "/?section=profile&tab=predictions", label: "Predictions", icon: Trophy },
  { href: "/?section=profile&tab=notifications", label: "Notifications", icon: Bell },
  { href: "/?section=profile&tab=profile", label: "Profile", icon: Pencil },
];

export function ProfileMenu() {
  const { user, displayName, avatar, isAuthorized, signOut, pointsBalance } = useAuth();
  const { start: startTour } = useProductTour();
  const [open, setOpen] = useState(false);
  // Outside the menu, so it stays open once the menu closes.
  const [reporting, setReporting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);

  // Only ever rendered from SignInButton's isAuthorized branch, but checked directly here too —
  // a menu implying "you're signed in" is exactly the wrong thing to show from any other caller
  // that forgets that distinction.
  if (!isAuthorized || !user) return null;

  // The profile's own firstName (session-cached) — always set by the time this renders (getting
  // here at all requires a completed profile), email is just the last-resort fallback.
  const name = displayName ?? user.email ?? "Account";

  return (
    <div className="relative">
      {/* Named by what it shows (the name and points) plus "account menu", so the accessible name
          contains the visible label (WCAG 2.5.3) rather than replacing it. */}
      {/* Just the avatar: name and points are at the top of the menu it opens. Named for screen readers. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${name}, account menu${pointsBalance !== null ? `, ${pointsBalance} points` : ""}`}
        className={`flex size-9 items-center justify-center overflow-hidden rounded-lg border transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${open ? "border-white/25" : "border-white/10 hover:border-white/20"}`}
      >
        {/* The avatar fills the square and is clipped to its corners, like the bell beside it. */}
        <PersonAvatar id={user.uid} avatar={avatar} size={34} />
      </button>

      <HeaderPanel open={open} onClose={close} anchorRef={triggerRef} id={panelId} label="Account">
        {/* Who's signed in, at the top of the menu, as account menus everywhere open. */}
        <div className="flex items-center gap-3 border-b border-white/10 px-3.5 py-3">
          <PersonAvatar id={user.uid} avatar={avatar} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-semibold text-primary">{name}</p>
            {user.email && user.email !== name && <p className="truncate text-caption text-tertiary">{user.email}</p>}
          </div>
          {pointsBalance !== null && (
            <span className="flex shrink-0 items-center gap-1 text-caption font-semibold tabular text-secondary">
              <Icon icon={Star} size={16} className="size-3.5 text-tertiary" />
              {pointsBalance}
            </span>
          )}
        </div>
        <nav aria-label="Account" className="p-1.5">
          {ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-control px-2.5 py-2 text-body-sm text-secondary transition-colors duration-fast hover:bg-white/[0.08] hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
            >
              <Icon icon={item.icon} size={16} className="text-tertiary" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 p-1.5">
          {/* Replays the product tour from step 1. Clears only the onboarding stamp -
              communities, predictions and preferences are untouched. */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void fetch("/api/users/onboarding", { method: "DELETE" }).catch(() => {});
              startTour();
            }}
            className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-body-sm text-secondary transition-colors duration-fast hover:bg-white/[0.08] hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Icon icon={Sparkles} size={16} className="text-tertiary" />
            Replay the tour
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setReporting(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-body-sm text-secondary transition-colors duration-fast hover:bg-white/[0.08] hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Icon icon={LifeBuoy} size={16} className="text-tertiary" />
            Report a problem
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-body-sm text-secondary transition-colors duration-fast hover:bg-white/[0.08] hover:text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Icon icon={LogOut} size={16} className="text-tertiary" />
            Log out
          </button>
        </div>
      </HeaderPanel>
      <ReportProblemDialog open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}
