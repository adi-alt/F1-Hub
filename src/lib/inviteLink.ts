// Client-safe (no node:crypto) - the "Paste invite link" box runs in the browser. Signing and
// verification live in inviteTokens.ts, which is server-only.

/** Pulls an invitation token out of whatever a person pasted (a full link, `?invite=…`, or the bare
 * token). Only extracts the shape; the server decides whether it is genuine. */
export function extractInviteToken(pasted: string): string | null {
  const text = pasted.trim();
  const fromQuery = text.match(/[?&]invite=([A-Za-z0-9._-]+)/)?.[1];
  const candidate = fromQuery ?? (/^v1\.[0-9a-f]{32}\.\d+\.[A-Za-z0-9_-]+$/.test(text) ? text : null);
  return candidate ?? null;
}
