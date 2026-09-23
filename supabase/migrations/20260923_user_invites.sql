-- Admin-issued invitations to F1 Hub.
--
-- Self-signup is unchanged and remains the normal way in: this table only adds a second door,
-- where an admin names an email up front and optionally the role that account should land on.
--
-- Authority note, because it drives the whole shape of this table: an invite is NOT a bearer
-- credential. The role is applied during completeSignup, keyed on the email Supabase Auth has
-- already proven the signer-upper controls (the OTP step). The token below exists only so the
-- email can carry a working "accept" link that pre-fills the address — someone who steals a
-- token still cannot claim the invite without receiving that mailbox's one-time code. That is
-- why the token is stored only as a SHA-256 hash: it is never needed again in plaintext after
-- the email is sent, so there is no reason for the column to be able to leak one.
create table if not exists user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- null means "invite them as an ordinary member" — the same three-way role space as
  -- profiles.role, where the absence of a row-level role IS the member tier (see lib/rbac.ts).
  role text check (role in ('admin', 'moderator')),
  token_hash text not null unique,
  invited_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references profiles (id) on delete set null,
  revoked_at timestamptz
);

-- At most one *live* invite per address, while still keeping every superseded one for the audit
-- trail. A partial unique index is what makes "re-inviting someone who already has a pending
-- invite is a conflict, but re-inviting someone whose invite was revoked or already used is
-- fine" a database guarantee rather than a check the application has to remember to perform.
create unique index if not exists user_invites_one_pending_per_email
  on user_invites (lower(email))
  where accepted_at is null and revoked_at is null;

-- Redemption looks an address up on every completed signup, so it wants its own index; the
-- lower() expression has to match the one the lookup uses or Postgres won't use this.
create index if not exists user_invites_email_idx on user_invites (lower(email));

-- Every read and write goes through supabaseAdmin (service role, which bypasses RLS entirely),
-- so these policies are defence in depth rather than the primary control — the same posture the
-- rest of this schema takes. No policy grants INSERT/UPDATE/DELETE to anyone: there is no
-- legitimate client-side write path to this table, and a pending invite naming a role is exactly
-- the sort of row that must never be writable from a browser.
alter table user_invites enable row level security;
create policy "admin read invites" on user_invites for select using (is_admin(auth.uid()));
