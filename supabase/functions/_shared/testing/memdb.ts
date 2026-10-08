import type { SupabaseClient } from "@supabase/supabase-js";

// A small in-memory stand-in for the parts of supabase-js the Meta modules use, so their tests
// run without a network. Not a general fake: it supports exactly what those modules call.

export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;

// Columns that must be unique together per table, to reproduce Postgres's 23505 on duplicates.
export type Uniques = Record<string, string[]>;

const sameKey = (cols: string[], a: Row, b: Row) => cols.every((c) => a[c] === b[c]);

class Query {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row = {};
  private conflict: string[] = [];
  private filters: ((r: Row) => boolean)[] = [];
  private returning = false;
  private mode: "none" | "single" | "maybe" = "none";
  private descending = false;
  private max = Infinity;
  private head = false;
  private wantCount = false;

  private tables: Tables;
  private table: string;
  private uniques: Uniques;
  private seq: { n: number };

  constructor(tables: Tables, table: string, uniques: Uniques, seq: { n: number }) {
    this.tables = tables;
    this.table = table;
    this.uniques = uniques;
    this.seq = seq;
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    this.head = !!opts?.head;
    this.wantCount = !!opts?.count;
    return this;
  }
  insert(row: Row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  upsert(row: Row, opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = row;
    this.conflict = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  gte(col: string, v: string) {
    this.filters.push((r) => String(r[col]) >= v);
    return this;
  }
  // Compared as strings, like gte: ISO timestamps sort correctly that way. A null column never matches.
  lt(col: string, v: string) {
    this.filters.push((r) => r[col] != null && String(r[col]) < v);
    return this;
  }
  // PostgREST-style OR of clauses such as "a.is.null,b.lt.2026-10-05T11:58:00.000Z".
  or(clauses: string) {
    const tests = clauses.split(",").map((c) => {
      const [col, op, ...rest] = c.trim().split(".");
      const v = rest.join(".");
      if (op === "is") return (r: Row) => (r[col] ?? null) === (v === "null" ? null : v);
      if (op === "eq") return (r: Row) => r[col] === v;
      if (op === "lt") return (r: Row) => r[col] != null && String(r[col]) < v;
      throw new Error(`memdb: unsupported .or operator "${op}"`);
    });
    this.filters.push((r) => tests.some((t) => t(r)));
    return this;
  }
  order(_col: string, opts?: { ascending?: boolean }) {
    this.descending = opts?.ascending === false;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    try {
      return Promise.resolve(this.run()).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  }

  private shape(rows: Row[]) {
    if (this.mode === "none") return { data: rows, error: null };
    if (this.mode === "single" && rows.length !== 1) {
      return { data: null, error: { message: "Expected one row", code: "PGRST116" } };
    }
    return { data: rows[0] ?? null, error: null };
  }

  private run() {
    const rows = this.tables[this.table] ??= [];
    const unique = this.uniques[this.table];

    const add = (r: Row) => {
      const row: Row = { id: `${this.table}-${++this.seq.n}`, created_at: new Date().toISOString(), ...r, _seq: this.seq.n };
      rows.push(row);
      return row;
    };

    if (this.op === "insert") {
      if (unique && rows.some((r) => sameKey(unique, r, this.payload) && unique.every((c) => this.payload[c] != null))) {
        return { data: null, error: { code: "23505", message: "duplicate key value" } };
      }
      const row = add(this.payload);
      return this.returning ? this.shape([row]) : { data: null, error: null };
    }

    if (this.op === "upsert") {
      const existing = rows.find((r) => sameKey(this.conflict, r, this.payload));
      const row = existing ? Object.assign(existing, this.payload) : add(this.payload);
      return this.returning ? this.shape([row]) : { data: null, error: null };
    }

    const matching = rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === "update") {
      for (const r of matching) Object.assign(r, this.payload);
      return this.returning ? this.shape(matching) : { data: null, error: null };
    }
    if (this.op === "delete") {
      this.tables[this.table] = rows.filter((r) => !matching.includes(r));
      return { data: null, error: null };
    }

    if (this.head) return { data: null, count: matching.length, error: null };
    const sorted = [...matching].sort((a, b) => (Number(a._seq ?? 0) - Number(b._seq ?? 0)) * (this.descending ? -1 : 1));
    const out = this.shape(sorted.slice(0, this.max));
    return this.wantCount ? { ...out, count: matching.length } : out;
  }
}

export function memDb(tables: Tables, uniques: Uniques = {}): SupabaseClient {
  const seq = { n: 0 };
  for (const rows of Object.values(tables)) for (const r of rows) r._seq ??= ++seq.n;
  return { from: (t: string) => new Query(tables, t, uniques, seq) } as unknown as SupabaseClient;
}
