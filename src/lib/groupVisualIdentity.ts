// A pure, dependency-free module (client-safe - see groupPredictionTypes.ts's own comment on why
// that matters for anything a client component imports).
//
// Every group deserves a real visual identity the moment it's created, not a flat empty rectangle
// until someone gets around to uploading a banner. A deterministic gradient - the same two hues
// every time for the same group id, never random - is the "abstract generated design" this app's
// own visual language calls for (dark surfaces, a restrained accent, no stock photography), with
// zero image assets, zero storage cost, and zero licensing risk. Real uploaded banners always win;
// this is only ever the fallback.

function hashString(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // keep it a 32-bit int
  }
  return Math.abs(hash);
}

/** A dark, two-hue diagonal gradient seeded by the group's own id - stays constant across renders
 * and reloads (a hash of a stable id, not Math.random()). Kept deliberately dark/desaturated to
 * sit behind a white group name without needing its own scrim. */
export function bannerGradient(seed: string): string {
  const hash = hashString(seed);
  const hue1 = hash % 360;
  const hue2 = (hue1 + 35 + (hash % 70)) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 38%, 16%), hsl(${hue2}, 45%, 9%))`;
}
