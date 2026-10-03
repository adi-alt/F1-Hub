import { z } from "zod";

/** Request schemas with size caps for the profile, sign-up and pick endpoints (audit SEC-25).
 *
 * The caps are far above every real value - in production today names are at most 9 characters,
 * nobody has more than 6 favourites, favourite ids are at most 8 characters and a pick is a
 * 3-letter driver code. They exist so one request can't store megabytes in a profile or a pick,
 * not to police what a name looks like; format rules (the username pattern, "first name is
 * required") stay where they already are, in the services. */
export const LIMITS = { name: 50, favorites: 200, id: 64, driver: 16 } as const;

const favoriteIds = z.array(z.string().trim().min(1).max(LIMITS.id)).max(LIMITS.favorites);
const personName = z.string().trim().max(LIMITS.name);
const driverCode = z.string().trim().min(1).max(LIMITS.driver);

/** PATCH /api/users/me. Unknown keys are dropped, as before; a known key with the wrong type or
 * over its cap is a 400 rather than silently ignored. */
export const preferencesPatchSchema = z.object({
  favoriteDrivers: favoriteIds.optional(),
  favoriteTeams: favoriteIds.optional(),
  favoriteTracks: favoriteIds.optional(),
  notifyBeforeQualifying: z.boolean().optional(),
  notifyOnResults: z.boolean().optional(),
  firstName: personName.optional(),
});

/** POST /api/auth/complete-signup. The username's own format (3-20 letters, numbers or
 * underscores) is completeSignup's check; this only bounds it. */
export const signupSchema = z.object({
  firstName: personName,
  lastName: personName,
  username: z.string().max(LIMITS.name),
  favoriteDrivers: favoriteIds.optional(),
  favoriteTeams: favoriteIds.optional(),
  favoriteTracks: favoriteIds.optional(),
});

/** POST /api/picks. */
export const pickSchema = z.object({
  raceId: z.string().trim().min(1).max(LIMITS.id),
  predictedWinner: driverCode,
  predictedPodium: z.tuple([driverCode, driverCode, driverCode]),
});

/** POST /api/archive/favorites (one id at a time). */
export const favoriteToggleSchema = z.object({
  type: z.enum(["track", "driver", "team"]),
  id: z.string().trim().min(1).max(LIMITS.id),
  favorited: z.boolean(),
});
