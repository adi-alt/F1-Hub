"use client";

import Image from "next/image";
import { useState } from "react";

// A small, fixed, deterministic palette for the initials fallback below - every identity used to
// fall back to the same flat red circle regardless of who or what it was, which is fine for one
// avatar on a page but reads as visibly wrong the moment several appear together (a feed's worth of
// different people and communities, all rendered in the one identical color). Each entry is one
// hue at the exact same opacity/weight formula the red version always used, so the *treatment*
// stays consistent (a tinted circle + matching text, nothing louder) while the *hue* varies -
// restrained, not a rainbow. Kept short and hand-picked rather than generated from an arbitrary hue
// wheel, so every option is one this app's own dark theme actually reads well against.
const FALLBACK_PALETTE = [
  "bg-[var(--f1-red)]/20 text-[var(--f1-red)]",
  "bg-sky-500/20 text-sky-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-amber-500/20 text-amber-400",
  "bg-violet-500/20 text-violet-400",
  "bg-teal-500/20 text-teal-400",
  "bg-orange-500/20 text-orange-400",
  "bg-indigo-500/20 text-indigo-400",
] as const;

/** The one host next.config.ts's `remotePatterns` actually allow-lists, derived from the same
 * public env var that file derives it from. Anything else Next's image optimizer refuses outright,
 * which surfaces as an `onError` and - before this - a silent fall through to initials. */
const STORAGE_HOST = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

/**
 * Whether Next's optimizer will actually accept this URL, or whether it has to be passed through
 * untouched.
 *
 * This component was written for Storage-hosted media (driver headshots, team logos, group
 * avatars) and hardcoded the optimizer on. But the signed-in user's own photo is an OAuth avatar
 * (`session.photoURL`, captured from `user_metadata.avatar_url` at sign-in - so a Google/GitHub
 * CDN URL), and that host is not in remotePatterns. Every surface that showed the viewer their own
 * photo through this component - the post composer, their own posts, their own comments, the
 * comment composer - therefore got an optimizer rejection and rendered a letter avatar, while the
 * header's ProfileMenu, which renders the identical URL with `unoptimized`, showed the real photo
 * a few hundred pixels away. Same identity source all along; only the optimizer differed.
 *
 * Detecting the host rather than adding an `unoptimized` prop at the four OAuth call sites: the
 * next provider added would otherwise reintroduce exactly this bug, silently and in the same way.
 */
function canOptimize(url: string): boolean {
  if (url.startsWith("/")) return true; // same-origin asset
  if (!STORAGE_HOST) return false;
  try {
    return new URL(url).hostname === STORAGE_HOST;
  } catch {
    return false;
  }
}

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** First letter of every meaningful word, so a multi-word identity reads as its own real acronym
 * rather than a truncated two-letter stub of it: "Ferrari Tifosi Hub" -> "FTH", "Red Bull Racing
 * Fans" -> "RBRF", "Aditya Verma" -> "AV", "Apex" -> "A". Purely-punctuation words ("&", "-") are
 * skipped - they carry no letter worth standing for. Capped at 4 because that is where a circle
 * this size stops being legible, and because every name long enough to exceed it (a five-word
 * community title) is already better served by its own uploaded avatar. */
const MAX_INITIALS = 4;

function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((word) => word.match(/\p{L}|\p{N}/u)?.[0] ?? "")
    .filter(Boolean);
  if (letters.length === 0) return "?";
  return letters.slice(0, MAX_INITIALS).join("").toUpperCase();
}

/** Initials wider than two characters need a smaller glyph to stay inside the same circle - the
 * circle's size is fixed by the layout around it, so the type is what gives. Not a continuous
 * formula: four hand-checked steps, each the largest size that still clears the circle's edge at
 * that length. */
const FONT_DIVISOR: Record<number, number> = { 1: 2.4, 2: 2.4, 3: 3.1, 4: 3.9 };

/** A driver headshot, team logo, or group avatar — anything backed by the shared Supabase
 * Storage `media`/`group-avatars` buckets — or a deterministic initials fallback when there's no
 * image (same convention ProfileMenu.tsx's OAuth avatar already uses for the one case it covers),
 * or when there *was* a URL but it failed to actually load (a stale Storage path, a transient
 * network blip) — onError flips to the same fallback instead of leaving a broken-image icon on
 * screen. Not `unoptimized`: unlike ProfileMenu's external OAuth-provider avatar, every image this
 * component ever renders comes from the one Storage host next.config.ts's remotePatterns already
 * allow-lists, so Next's own image optimizer (resizing, format conversion, caching) applies for
 * real. */
export function EntityAvatar({
  imageUrl,
  name,
  size = 40,
  shape = "circle",
  fit = "cover",
  seed,
}: {
  imageUrl: string | null;
  name: string;
  size?: number;
  shape?: "circle" | "square";
  /** "contain" for team logos - they're rarely square, and cropping one to fill a circle loses
   * the shape that makes it recognizable. "cover" (default) suits headshots/avatars, which are. */
  fit?: "cover" | "contain";
  /** What the fallback color is hashed from - pass a real, stable id (a user or group's own uuid)
   * wherever one is available, so two different people who happen to share a first name don't get
   * mistaken for the same color-coded identity. Falls back to `name` itself when no id is passed
   * (every call site that predates this prop), which is still deterministic and still varied - the
   * fix this addresses is "every fallback avatar in the app was the identical flat red circle",
   * not "some fallbacks lacked an id to hash". */
  seed?: string;
}) {
  const [failed, setFailed] = useState(false);
  // The box was already reserved (explicit width/height below), so nothing ever shifted - but the
  // space sat empty until the image decoded. A shimmer underneath it reads as loading rather than
  // as a gap, and costs nothing: it's painted behind the image and simply stops mattering once the
  // image is opaque.
  const [loaded, setLoaded] = useState(false);
  // Written as two literal, complete class strings rather than an interpolated `object-${fit}` -
  // Tailwind's build-time scanner only picks up whole class names it can see as-is in the source.
  const rounding = shape === "circle" ? "rounded-full" : "rounded-lg";
  const objectFit = fit === "contain" ? "object-contain" : "object-cover";
  if (imageUrl && !failed) {
    return (
      <span className={`relative block shrink-0 overflow-hidden ${rounding}`} style={{ width: size, height: size }}>
        {!loaded && <span aria-hidden className={`skeleton-shimmer absolute inset-0 ${rounding} bg-white/[0.05]`} />}
        <Image
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          className={`relative shrink-0 ${rounding} ${objectFit} transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          style={{ width: size, height: size }}
          unoptimized={!canOptimize(imageUrl)}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  const tone = FALLBACK_PALETTE[hashSeed(seed ?? (name || "?")) % FALLBACK_PALETTE.length];
  const initials = initialsOf(name);
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${rounding} font-semibold ${tone}`}
      style={{ width: size, height: size, fontSize: size / (FONT_DIVISOR[initials.length] ?? 2.4) }}
    >
      {initials}
    </span>
  );
}
