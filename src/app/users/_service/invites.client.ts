import type { InviteRole, UserInvite } from "@/lib/supabase/invites";

export type InviteOutcome =
  | { email: string; ok: true; role: InviteRole }
  | { email: string; ok: false; reason: string };

export type SendInvitesResult = { sent: number; failed: number; results: InviteOutcome[] };

/** Surfaces the server's own message rather than a bare status code — sendInvites throws
 * ServiceError with text meant to be read ("Invite up to 50 people at a time."), and swallowing
 * it into "400" would waste the one thing that tells the admin what to fix. */
async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const message = await res
      .json()
      .then((b) => (b as { error?: string }).error)
      .catch(() => null);
    throw new Error(message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchInvites(): Promise<UserInvite[]> {
  const body = await unwrap<{ invites: UserInvite[] }>(await fetch("/api/users/invites"));
  return body.invites;
}

export async function postInvites(invites: { email: string; role: InviteRole }[]): Promise<SendInvitesResult> {
  return unwrap<SendInvitesResult>(
    await fetch("/api/users/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invites }),
    }),
  );
}

export async function postRevokeInvite(id: string): Promise<void> {
  await unwrap(await fetch(`/api/users/invites/${id}/revoke`, { method: "POST" }));
}

export async function postResendInvite(id: string): Promise<void> {
  await unwrap(await fetch(`/api/users/invites/${id}/resend`, { method: "POST" }));
}
