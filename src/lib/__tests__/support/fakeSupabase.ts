// A small in-memory stand-in for the parts of supabase-js the service layer uses, so the
// authorization and error-mapping logic that lives in TypeScript can be tested against the REAL
// service code (src/lib/supabase/*) without a network or a database.
//
// Scope, honestly: it models filters (eq/neq/in/is/gt/gte/lt/lte), order/limit, insert/update/upsert/
// delete, `.single()` / `.maybeSingle()` semantics, `{ count, head }` selects, unique-key conflicts
// (23505) and defaults. It does NOT model column projection (a select returns whole stored rows), embedded
// resources beyond what a fixture already nests, evaluating `.or()` (it is recorded, see orCalls), or RLS - everything the SQL functions and
// policies decide is tested in the PGlite suites (src/lib/__tests__/db), not here. The `rpc()` side is
// scripted per test, because what an rpc does is the database's job.

import { randomUUID } from "node:crypto";

export type Row = Record<string, unknown>;
type PgError = { message: string; code?: string; details?: string | null };
export type Result = { data: unknown; error: PgError | null; count?: number | null };

export class FakeSupabase {
  tables: Record<string, Row[]> = {};
  /** Per-table column sets that must be unique together (insert conflicts with 23505). */
  unique: Record<string, string[]> = {};
  /** Per-table defaults applied to inserted rows (like column defaults). */
  defaults: Record<string, () => Row> = {};
  /** Scripted rpc behaviour. Return `{ data, error }`. Unscripted calls fail loudly. */
  rpcs: Record<string, (args: Row) => Result> = {};
  rpcCalls: { fn: string; args: Row }[] = [];
  /** Every `.or(expr)` filter string seen. The fake does NOT evaluate these (PostgREST's filter grammar
   * is the database's business) - it records them so a test can assert on what was asked. */
  orCalls: string[] = [];

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }
  seed(table: string, ...rows: Row[]): this {
    this.rows(table).push(...rows.map((r) => ({ ...(this.defaults[table]?.() ?? {}), ...r })));
    return this;
  }

  from = (table: string) => new FakeQuery(this, table);

  rpc = (fn: string, args: Row = {}) => {
    this.rpcCalls.push({ fn, args });
    const handler = this.rpcs[fn];
    const result: Result = handler ? handler(args) : { data: null, error: { message: `no fake scripted for rpc ${fn}` } };
    return Promise.resolve(result);
  };
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private filters: ((row: Row) => boolean)[] = [];
  private patch: Row = {};
  private incoming: Row[] = [];
  private onConflict: string[] | null = null;
  private wantsCount = false;
  private head = false;
  private returning = false;
  private cardinality: "many" | "maybe" | "one" = "many";
  private ordering: { col: string; asc: boolean } | null = null;
  private max: number | null = null;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(_columns?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.wantsCount = !!opts?.count;
      this.head = !!opts?.head;
    } else {
      this.returning = true;
    }
    return this;
  }
  insert(row: Row | Row[]) {
    this.op = "insert";
    this.incoming = Array.isArray(row) ? row : [row];
    return this;
  }
  upsert(row: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.incoming = Array.isArray(row) ? row : [row];
    this.onConflict = opts?.onConflict ? opts.onConflict.split(",").map((c) => c.trim()) : null;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.filters.push((r) => vals.includes(r[col]));
    return this;
  }
  is(col: string, val: null | boolean) {
    this.filters.push((r) => (r[col] ?? null) === val);
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push((r) => r[col] != null && String(r[col]) > String(val));
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push((r) => r[col] != null && String(r[col]) >= String(val));
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push((r) => r[col] != null && String(r[col]) < String(val));
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push((r) => r[col] != null && String(r[col]) <= String(val));
    return this;
  }
  or(expr: string) {
    this.db.orCalls.push(expr);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.ordering = { col, asc: opts?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.cardinality = "maybe";
    return this;
  }
  single() {
    this.cardinality = "one";
    return this;
  }

  then<T1 = Result, T2 = never>(onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null): Promise<T1 | T2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private shape(rows: Row[], count?: number): Result {
    if (this.cardinality === "many") return { data: rows, error: null, count: count ?? null };
    if (rows.length > 1) return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
    if (rows.length === 0) return this.cardinality === "one" ? { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } } : { data: null, error: null };
    return { data: rows[0], error: null };
  }

  private conflictsWith(candidate: Row, keys: string[]): Row | undefined {
    return this.db.rows(this.table).find((r) => keys.every((k) => r[k] === candidate[k]));
  }

  private execute(): Result {
    const table = this.db.rows(this.table);
    if (this.op === "select") {
      let rows = this.matching();
      if (this.ordering) {
        const { col, asc } = this.ordering;
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
      }
      const count = rows.length;
      if (this.max !== null) rows = rows.slice(0, this.max);
      if (this.head) return { data: null, error: null, count };
      return this.shape(rows.map((r) => ({ ...r })), this.wantsCount ? count : undefined);
    }

    if (this.op === "insert" || this.op === "upsert") {
      const written: Row[] = [];
      for (const raw of this.incoming) {
        const row: Row = { ...(this.db.defaults[this.table]?.() ?? {}), ...raw };
        if (this.op === "upsert" && this.onConflict) {
          const existing = this.conflictsWith(row, this.onConflict);
          if (existing) {
            Object.assign(existing, raw);
            written.push(existing);
            continue;
          }
        }
        const uniqueKeys = this.db.unique[this.table];
        if (uniqueKeys && this.conflictsWith(row, uniqueKeys)) {
          return { data: null, error: { message: `duplicate key value violates unique constraint on ${this.table}`, code: "23505" } };
        }
        table.push(row);
        written.push(row);
      }
      return this.returning ? this.shape(written.map((r) => ({ ...r }))) : { data: null, error: null };
    }

    if (this.op === "update") {
      const rows = this.matching();
      for (const r of rows) Object.assign(r, this.patch);
      return this.returning ? this.shape(rows.map((r) => ({ ...r }))) : { data: null, error: null };
    }

    // delete
    const doomed = new Set(this.matching());
    this.db.tables[this.table] = table.filter((r) => !doomed.has(r));
    return { data: null, error: null };
  }
}

/** Convenience for tests: a uuid. */
export const newId = () => randomUUID();
