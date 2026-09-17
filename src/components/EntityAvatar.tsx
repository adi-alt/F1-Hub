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

function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Initials from up to the first two meaningful (non-space) words - "Champion Club" -> "CC",
 * "Aditya Verma" -> "AV", a single word like "asdf" -> "A". Never more than 2 characters: this
 * sits in a small circle, not a badge built to hold an acronym. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
}

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
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  const tone = FALLBACK_PALETTE[hashSeed(seed ?? (name || "?")) % FALLBACK_PALETTE.length];
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${rounding} font-semibold ${tone}`}
      style={{ width: size, height: size, fontSize: size / 2.4 }}
    >
      {initialsOf(name)}
    </span>
  );
}
