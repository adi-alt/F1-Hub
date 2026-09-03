// A pure, dependency-free module (client-safe - see groupPredictionTypes.ts's own comment on why
// that matters for anything a client component imports).
//
// Every group deserves a real visual identity the moment it's created, not a flat empty rectangle
// until someone gets around to uploading a banner. A deterministic, layered gradient - the same
// look every time for the same group id, never random - stands in for a photo with zero image
// assets, zero storage cost, and zero licensing risk. Real uploaded banners always win; this is
// only ever the fallback.

function hashString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // keep it a 32-bit int
  }
  return Math.abs(hash);
}

/** A dark base gradient plus an off-center glow and a couple of angled light streaks - seeded by
 * the group's own id, so it's stable across renders/reloads, and reads as "art directed" rather
 * than a uniform repeating texture. Kept dark/desaturated so it sits behind a white group name
 * without needing its own scrim. */
export function bannerLayers(seed: string): string {
  const hash = hashString(seed);
  const hue1 = hash % 360;
  const hue2 = (hue1 + 35 + (hash % 70)) % 360;
  const glowX = 15 + (hash % 70); // 15-85%, keeps the glow off the very edges
  const glowY = 20 + ((hash >> 4) % 40);
  const streakAngle = 100 + (hash % 40); // 100-140deg, a consistent "speed line" tilt

  return [
    `radial-gradient(circle at ${glowX}% ${glowY}%, hsla(${hue1}, 70%, 55%, 0.22), transparent 55%)`,
    `linear-gradient(${streakAngle}deg, transparent 42%, hsla(0,0%,100%,0.05) 43%, hsla(0,0%,100%,0.05) 44%, transparent 45%)`,
    `linear-gradient(${streakAngle}deg, transparent 56%, hsla(0,0%,100%,0.04) 57%, hsla(0,0%,100%,0.04) 58%, transparent 59%)`,
    `linear-gradient(135deg, hsl(${hue1}, 42%, 15%), hsl(${hue2}, 48%, 8%))`,
  ].join(", ");
}
