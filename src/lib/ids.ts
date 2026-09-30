/** True for a canonical UUID string. Routes use this to turn a malformed id (the client sends
 * `temp-…` for a comment that hasn't been saved yet) into a clean 400/404 instead of letting
 * Postgres raise 22P02 and surface as a 500. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
