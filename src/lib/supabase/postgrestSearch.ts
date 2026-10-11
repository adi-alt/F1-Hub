/** A PostgREST `ilike` value matching `term` anywhere, safe to put inside an `.or()` filter string
 * (audit SEC-21). The same quoting searchUsers() in users.ts already relies on:
 *  - `%` and `_` are LIKE wildcards and `\` is LIKE's escape character, so all three are escaped
 *    and match literally;
 *  - the value is double-quoted, which is how PostgREST carries its own separators (`,` `.` `:`
 *    `(` `)`) as plain text; inside the quotes `"` and `\` each take a backslash;
 *  - `*` is dropped: PostgREST reads it as a wildcard in a like pattern and has no escape for it.
 */
export function ilikeContainsValue(term: string): string {
  const likeEscaped = term.replace(/\*/g, "").replace(/[\\%_]/g, (c) => `\\${c}`);
  return `"${`%${likeEscaped}%`.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}
