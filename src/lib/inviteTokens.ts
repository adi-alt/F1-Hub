// Signed community-invite tokens (audit SEC-06). A token is  v1.<inviteId>.<expiry>.<signature>
// where the signature is an HMAC over (group id, invite id, expiry) keyed from a server secret.
//
// What that buys, and what it deliberately does not:
//   * a token can't be forged, re-targeted at a different community, or have its expiry edited
//     without the secret - checked here, before any database work;
//   * it is NOT the authority on whether an invitation is still usable. That is the group_invites
//     row (revoked? uses left? expired by the database clock?), checked atomically by
//     redeem_group_invite(). Revocation is therefore immediate rather than "when the token expires".
//
// Pure (node:crypto only) so it can be unit-tested and imported from server code without pulling in
// the Supabase client.

import { createHmac, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const SIGNATURE_BYTES = 16;

function secretFromEnv(): string {
  const secret = process.env.INVITE_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("INVITE_TOKEN_SECRET (or SESSION_SECRET) must be set to sign community invitations.");
  return secret;
}

// A dedicated sub-key, so a signature made for invitations can never double as any other use of the
// same underlying secret (the iron-session cookie key, say).
function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("apex.group-invite.v1").digest();
}

const compact = (uuid: string) => uuid.replace(/-/g, "").toLowerCase();
function expand(hex: string): string | null {
  return /^[0-9a-f]{32}$/.test(hex) ? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` : null;
}

function sign(key: Buffer, groupId: string, inviteHex: string, expiryEpoch: number): Buffer {
  return createHmac("sha256", key).update(`${VERSION}.${groupId.toLowerCase()}.${inviteHex}.${expiryEpoch}`).digest().subarray(0, SIGNATURE_BYTES);
}

export function signInviteToken(input: { inviteId: string; groupId: string; expiresAt: Date }, secret: string = secretFromEnv()): string {
  const inviteHex = compact(input.inviteId);
  const expiryEpoch = Math.floor(input.expiresAt.getTime() / 1000);
  const signature = sign(signingKey(secret), input.groupId, inviteHex, expiryEpoch).toString("base64url");
  return `${VERSION}.${inviteHex}.${expiryEpoch}.${signature}`;
}

export type InviteTokenCheck = { ok: true; inviteId: string; expiresAt: Date } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

/** Verifies a token presented for `groupId`. `nowMs` is injectable for tests. */
export function verifyInviteToken(token: unknown, groupId: string, nowMs: number = Date.now(), secret: string = secretFromEnv()): InviteTokenCheck {
  if (typeof token !== "string" || token.length > 200) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return { ok: false, reason: "malformed" };
  const [, inviteHex, expiryRaw, signatureRaw] = parts;
  const inviteId = expand(inviteHex);
  if (!inviteId || !/^\d{1,12}$/.test(expiryRaw) || !/^[A-Za-z0-9_-]{20,24}$/.test(signatureRaw)) return { ok: false, reason: "malformed" };
  const expiryEpoch = Number(expiryRaw);

  const expected = sign(signingKey(secret), groupId, inviteHex, expiryEpoch);
  const presented = Buffer.from(signatureRaw, "base64url");
  // Canonical spelling only: the last base64url character of a 16-byte value carries spare bits, so
  // several strings would decode to the same MAC. Same authority, but one token should have one form.
  if (presented.toString("base64url") !== signatureRaw) return { ok: false, reason: "bad_signature" };
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return { ok: false, reason: "bad_signature" };
  if (nowMs >= expiryEpoch * 1000) return { ok: false, reason: "expired" };
  return { ok: true, inviteId, expiresAt: new Date(expiryEpoch * 1000) };
}
