// In-process Postgres (PGlite) loaded with the repo's real supabase/schema.sql + migrations (see
// schemaLoader.ts), for testing the things TypeScript unit tests can't: RLS policies, grants, and SQL
// functions. PGlite runs one statement at a time, so genuinely concurrent transactions are tested
// separately against a real Postgres (concurrency.pg.test.ts).

import { PGlite } from "@electric-sql/pglite";
import { loadAppSchema } from "./schemaLoader";

export type TestDb = {
  db: PGlite;
  /** Run `sql` as a Supabase role, with auth.uid() = uid (null = anonymous). service_role is the
   * server's own role: it bypasses RLS but is still bound by explicit GRANT/REVOKE on functions. */
  as<T = Record<string, unknown>>(role: "anon" | "authenticated" | "service_role", uid: string | null, sql: string, params?: unknown[]): Promise<T[]>;
  /** Run as the owner (bypasses RLS) - for fixtures. */
  owner<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
};

/** `upTo` (exclusive) stops before a migration, e.g. to reproduce a vulnerability pre-fix. */
export async function createTestDb(opts: { upTo?: string } = {}): Promise<TestDb> {
  const db = new PGlite();
  await loadAppSchema((sql) => db.exec(sql), opts);

  const as: TestDb["as"] = async (role, uid, sql, params = []) => {
    return db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
      await tx.exec(`set local role ${role}`);
      const res = await tx.query(sql, params);
      return res.rows as never;
    });
  };
  const owner: TestDb["owner"] = async (sql, params = []) => (await db.query(sql, params)).rows as never;

  return { db, as, owner, close: () => db.close() };
}

/** Inserts an auth user + profile and returns its id. */
export async function seedUser(t: TestDb, id: string, extra: { role?: string; points?: number } = {}) {
  await t.owner(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id.slice(0, 8)}@test.local`]);
  await t.owner(`insert into profiles (id, email, role) values ($1, $2, $3)`, [id, `${id.slice(0, 8)}@test.local`, extra.role ?? null]);
  if (extra.points !== undefined) await t.owner(`update profiles set points_balance = $2 where id = $1`, [id, extra.points]);
  return id;
}
