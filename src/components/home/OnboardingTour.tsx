"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { seasonHref } from "@/lib/routes";

const SECTIONS = [
  {
    emoji: "🏎️",
    title: "Season",
    body: "Live predictions for every race this year — finish order, pole, and a full race simulation once qualifying data warms up.",
    href: seasonHref(new Date().getFullYear()),
  },
  { emoji: "🗺️", title: "Circuits", body: "Every track's own history and characteristics, independent of any one season.", href: "/circuits" },
  { emoji: "📚", title: "Archive", body: "Every race back to 1950 — results, qualifying, pit stops, lap timing where it exists.", href: "/archive" },
  { emoji: "👥", title: "Groups", body: "Create or join a group, make podium picks, and see a real leaderboard once races finish.", href: "/groups" },
  {
    emoji: "⭐",
    title: "Personalize",
    body: "Favorite drivers, teams, and tracks — this homepage builds around them once you do.",
    href: "/profile?section=personalisation",
  },
];

/** Shown on every homepage visit until dismissed — `initiallyOpen` mirrors
 * `profile.onboardingCompletedAt == null` from the server, so a signed-in visit that hasn't
 * dismissed it yet sees it every single time, per the actual ask (not just once on signup). */
export function OnboardingTour({ initiallyOpen }: { initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [dismissing, setDismissing] = useState(false);

  if (!open) return null;

  async function dismiss() {
    setDismissing(true);
    setOpen(false); // don't make someone wait on a network round-trip to close a modal
    await fetch("/api/users/onboarding", { method: "POST" }).catch(() => {
      // best-effort — worst case it shows up again next visit, not a broken experience
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4" onClick={() => void dismiss()}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900/90 p-6 shadow-2xl backdrop-blur-xl"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--f1-red)]">Welcome to F1 Hub</p>
        <h2 className="mt-1 text-xl font-bold text-white">A quick look around</h2>
        <ul className="mt-5 space-y-1">
          {SECTIONS.map((s) => (
            <li key={s.title}>
              <Link href={s.href} className="flex items-start gap-3 rounded-xl p-3 transition hover:bg-white/5" onClick={() => void dismiss()}>
                <span className="text-2xl" aria-hidden>
                  {s.emoji}
                </span>
                <span>
                  <span className="block font-semibold text-white">{s.title}</span>
                  <span className="block text-sm text-neutral-400">{s.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button
          onClick={() => void dismiss()}
          disabled={dismissing}
          className="mt-6 w-full rounded-full bg-[var(--f1-red)] px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          Got it, don&apos;t show this again
        </button>
      </div>
    </div>,
    document.body,
  );
}
