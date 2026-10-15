"use client";

import Image from "next/image";
import { useState } from "react";

// The initials fallback is one neutral tone (design spec §1: nothing is coloured for decoration; colour is spent
// on meaning). A palette of tinted circles read as a toy next to real photos and team colours; a quiet disc with
// the initials reads as "no photo yet" and lets the real faces around it carry the colour.
const FALLBACK_TONE = "bg-surface-3 text-secondary ring-1 ring-inset ring-white/[0.06]";

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

/** The first letters of the first two meaningful words: "Ferrari Tifosi Hub" -> "FT", "Aditya Verma" -> "AV",
 * "Apex" -> "A". Purely-punctuation words ("&", "-") are skipped. Two, because past that the letters stop reading
 * as a monogram and start reading as an abbreviation squeezed into a circle. */
const MAX_INITIALS = 2;

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
}: {
  imageUrl: string | null;
  name: string;
  size?: number;
  shape?: "circle" | "square";
  /** "contain" for team logos - they're rarely square, and cropping one to fill a circle loses
   * the shape that makes it recognizable. "cover" (default) suits headshots/avatars, which are. */
  fit?: "cover" | "contain";
  /** A stable id for the identity. The fallback no longer varies by it (one neutral tone); accepted so callers
   * don't have to change. */
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
  const tone = FALLBACK_TONE;
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
