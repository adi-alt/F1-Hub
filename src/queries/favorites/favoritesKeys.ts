/** One root key — favorites are always "the signed-in viewer's own," never parameterized by uid
 * on the client (the server infers `uid` from the session on every read/write), so there's only
 * ever one cache entry to invalidate. */
export const favoritesKeys = {
  all: () => ["favorites"] as const,
};
