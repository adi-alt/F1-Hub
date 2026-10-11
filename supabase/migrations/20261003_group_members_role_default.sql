-- group_members.role's column default is stored in production as the text 'member' WITH the quotes
-- ('''member'''::text), so an insert that leaves role out would violate group_members_role_check.
-- schema.sql and a database built from it have the correct default; production does not. Found by the
-- staging schema diff (R-12). The app always sets role explicitly, so nothing is failing today; this
-- makes the default match schema.sql. Idempotent, and a no-op where the default is already correct.
alter table group_members alter column role set default 'member';
