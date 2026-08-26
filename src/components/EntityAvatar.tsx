"use client";

import Image from "next/image";
import { useState } from "react";

/** A driver headshot, team logo, or group avatar — anything backed by the shared Supabase
 * Storage `media`/`group-avatars` buckets — or a first-letter badge fallback when there's no
 * image (same convention ProfileMenu.tsx's OAuth avatar already uses), or when there *was* a URL
 * but it failed to actually load (a stale Storage path, a transient network blip) — onError flips
 * to the same letter badge instead of leaving a broken-image icon on screen. Not `unoptimized`:
 * unlike ProfileMenu's external OAuth-provider avatar, every image this component ever renders
 * comes from the one Storage host next.config.ts's remotePatterns already allow-lists, so Next's
 * own image optimizer (resizing, format conversion, caching) applies for real. */
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
}) {
  const [failed, setFailed] = useState(false);
  // Written as two literal, complete class strings rather than an interpolated `object-${fit}` -
  // Tailwind's build-time scanner only picks up whole class names it can see as-is in the source.
  const rounding = shape === "circle" ? "rounded-full" : "rounded-lg";
  const objectFit = fit === "contain" ? "object-contain" : "object-cover";
  if (imageUrl && !failed) {
    return (
      <Image
        src={imageUrl}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 ${rounding} ${objectFit}`}
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center ${rounding} bg-[var(--f1-red)]/20 font-semibold text-[var(--f1-red)]`}
      style={{ width: size, height: size, fontSize: size / 2.2 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
