import { createHmac, timingSafeEqual } from "node:crypto";
import { isNotificationKind, type NotificationKind } from "@/lib/notificationKinds";
import { emailOrigin } from "./layout";

/**
 * The "Stop emails like this" link: a signed token naming one person and one kind of email, so a click turns that
 * kind off without signing in (mail apps' one-click unsubscribe can't sign in). It can only ever switch an email off,
 * so a leaked link can do no more than that.
 */

const PURPOSE = "apex.unsubscribe.v1";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be set to sign unsubscribe links.");
  return createHmac("sha256", secret).update(PURPOSE).digest();
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest().subarray(0, 16).toString("base64url");

export function unsubscribeToken(userId: string, kind: NotificationKind): string {
  const payload = `${userId}.${kind}`;
  return `${payload}.${sign(payload)}`;
}

export function unsubscribeUrl(userId: string, kind: NotificationKind): string {
  return `${emailOrigin()}/api/notifications/unsubscribe?t=${encodeURIComponent(unsubscribeToken(userId, kind))}`;
}

/** The person and kind a token names, or null for anything forged, altered or malformed. */
export function readUnsubscribeToken(token: string | null | undefined): { userId: string; kind: NotificationKind } | null {
  const parts = (token ?? "").split(".");
  if (parts.length !== 3) return null;
  const [userId, kind, sig] = parts;
  if (!isNotificationKind(kind)) return null;
  const expected = Buffer.from(sign(`${userId}.${kind}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId, kind };
}
