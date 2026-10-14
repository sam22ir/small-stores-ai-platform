// In-memory stand-in for the parts of supabase-js that the inbound pipeline and its ports call.
//
// It is NOT a general fake. Each supported call mirrors what production does:
//   - select/insert/update with eq/is/not/in/gte/lt/or(ilike), order, limit, range, count, maybeSingle;
//     nested product_variants(...) embedding like PostgREST;
//   - rpc() implements the SQL functions the pipeline uses (claim/release_conversation, reply credits,
//     place_order from migration 0013 + the phone CHECK from 0010), with the same error messages and codes
//     that ports.ts maps.
// Anything else throws "fakedb: unsupported ...", so drift in the pipeline shows up as a loud error.

import { uuidFor } from "./state.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_CHECK = /^0[567][0-9]{8}$/; // orders_phone_check in 0010_orders_usage_delivery.sql

const nil = (v) => (v === undefined ? null : v);

function cmp(a, b) {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

// PostgREST "*" is the wildcard in filter syntax; ilike is case-insensitive.
function ilike(pattern) {
  const body = pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}$`, "is");
}

function orFilter(expr) {
  const tests = expr.split(",").map((clause) => {
    const [col, op, ...rest] = clause.trim().split(".");
    const value = rest.join(".");
    if (op === "ilike") {
      const re = ilike(value);
      return (r) => r[col] != null && re.test(String(r[col]));
    }
    if (op === "eq") return (r) => String(nil(r[col])) === value;
    if (op === "is" && value === "null") return (r) => nil(r[col]) === null;
    throw new Error(`fakedb: unsupported or() clause "${clause}"`);
  });
  return (r) => tests.some((t) => t(r));
}

const DEFAULTS = {
  agent_runs: { fast_path: false, error: null, used_credit: false, tool_calls: null },
  messages: { attachments: null, body: null },
};

const UNIQUE = {
  store_ai_cap_alerts: ["store_id", "month"],
  orders: ["store_id", "idempotency_key"],
};

class Query {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.op = "select";
    this.payload = null;
    this.cols = "*";
    this.filters = [];
    this.sorts = [];
    this.lim = Infinity;
    this.off = 0;
    this.mode = "many"; // many | single | maybe
    this.head = false;
    this.wantCount = false;
    this.returnRows = false;
  }

  select(cols = "*", opts = {}) {
    this.cols = cols;
    this.head = !!opts.head;
    this.wantCount = opts.count === "exact";
    if (this.op !== "select") this.returnRows = true;
    return this;
  }
  insert(rows) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  update(patch) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    throw new Error("fakedb: unsupported delete()");
  }
  upsert() {
    throw new Error("fakedb: unsupported upsert()");
  }
  eq(col, v) {
    this.filters.push((r) => nil(r[col]) === nil(v));
    return this;
  }
  is(col, v) {
    return this.eq(col, v);
  }
  in(col, vs) {
    this.filters.push((r) => vs.includes(nil(r[col])));
    return this;
  }
  not(col, op, v) {
    if (op !== "is" || v !== null) throw new Error(`fakedb: unsupported not(${col}, ${op})`);
    this.filters.push((r) => nil(r[col]) !== null);
    return this;
  }
  gte(col, v) {
    this.filters.push((r) => nil(r[col]) !== null && String(r[col]) >= v);
    return this;
  }
  lt(col, v) {
    this.filters.push((r) => nil(r[col]) !== null && String(r[col]) < v);
    return this;
  }
  or(expr) {
    this.filters.push(orFilter(expr));
    return this;
  }
  order(col, opts = {}) {
    this.sorts.push({ col, asc: opts.ascending !== false });
    return this;
  }
  limit(n) {
    this.lim = n;
    return this;
  }
  range(from, to) {
    this.off = from;
    this.lim = to - from + 1;
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
  then(resolve, reject) {
    try {
      return Promise.resolve(this.run()).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  }

  // Rows as the client returns them: copies, so callers can't mutate the database by accident.
  shape(rows) {
    const copies = structuredClone(rows);
    if (this.mode === "single") {
      if (copies.length !== 1) return { data: null, error: { message: "Expected one row", code: "PGRST116" } };
      return { data: copies[0], error: null };
    }
    if (this.mode === "maybe") return { data: copies[0] ?? null, error: null };
    return { data: copies, error: null };
  }

  project(row) {
    if (this.table === "products" && /product_variants\(/.test(this.cols)) {
      const variants = (this.db.tables.product_variants ?? [])
        .filter((v) => v.product_id === row.id)
        .map(({ id, label, price_cents, stock_quantity }) => ({ id, label, price_cents, stock_quantity }));
      return { ...row, product_variants: variants };
    }
    return row;
  }

  sortRows(rows) {
    const keys = this.sorts.length ? this.sorts : [{ col: "_seq", asc: true }];
    return [...rows].sort((a, b) => {
      for (const { col, asc } of keys) {
        // created_at and id are sequence-ordered here: same-millisecond inserts must keep their order.
        const c = col === "created_at" || col === "id" ? cmp(a._seq, b._seq) : cmp(nil(a[col]), nil(b[col]));
        if (c !== 0) return asc ? c : -c;
      }
      return cmp(a._seq, b._seq);
    });
  }

  run() {
    const db = this.db;
    const rows = (db.tables[this.table] ??= []);

    if (this.op === "insert") {
      const inserted = [];
      for (const raw of Array.isArray(this.payload) ? this.payload : [this.payload]) {
        const seq = ++db.seq;
        const row = {
          ...(DEFAULTS[this.table] ?? {}),
          id: db.idFor(seq),
          created_at: db.now().toISOString(),
          ...raw,
          _seq: seq,
        };
        const uniq = UNIQUE[this.table];
        if (uniq && rows.some((r) => uniq.every((c) => r[c] === row[c]))) {
          return { data: null, error: { code: "23505", message: `duplicate key value in ${this.table}` } };
        }
        rows.push(row);
        inserted.push(row);
      }
      if (!this.returnRows) return { data: null, error: null };
      return this.shapeRows(inserted);
    }

    const matching = rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === "update") {
      for (const r of matching) Object.assign(r, this.payload);
      if (!this.returnRows) return { data: null, error: null };
      return this.shapeRows(matching);
    }

    if (this.head) return { data: null, count: matching.length, error: null };

    const sorted = this.sortRows(matching);
    const page = sorted.slice(this.off, this.off + this.lim).map((r) => this.project(r));
    const out = this.shapeRows(page);
    return this.wantCount ? { ...out, count: matching.length } : out;
  }

  shapeRows(rows) {
    if (this.mode === "single" && rows.length !== 1) {
      return { data: null, error: { message: "Expected one row", code: "PGRST116" } };
    }
    return this.shape(rows);
  }
}

// Mirrors the SQL function place_order (0013_reliability_faq_stock.sql, the current version).
// One transaction: any error restores every stock value it touched.
function placeOrder(db, a) {
  const t = db.tables;
  const fail = (message, code = "P0001") => ({ data: null, error: { message, code } });

  if (a.p_key != null && !a.p_dry_run) {
    const ex = (t.orders ?? []).find((o) => o.store_id === a.p_store_id && o.idempotency_key === a.p_key);
    if (ex) {
      return {
        data: {
          order_id: ex.id,
          total_cents: ex.total_cents,
          subtotal_cents: ex.subtotal_cents,
          delivery_fee_cents: ex.delivery_fee_cents,
          duplicate: true,
        },
        error: null,
      };
    }
  }

  const items = a.p_items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) {
    return fail("items must contain 1-10 lines");
  }

  let fee = 0;
  const fees = (t.delivery_fees ?? []).filter((f) => f.store_id === a.p_store_id);
  if (fees.length) {
    const want = String(a.p_wilaya).trim().toLowerCase();
    const hit = fees.find((f) => f.wilaya.trim().toLowerCase() === want);
    if (!hit) return fail("wilaya_not_served");
    fee = hit.fee_cents;
  }

  const variants = t.product_variants ?? [];
  const snapshot = variants.map((v) => [v, v.stock_quantity]);
  const rollback = () => {
    for (const [v, stock] of snapshot) v.stock_quantity = stock;
  };
  const now = db.now();
  let subtotal = 0;
  const lines = [];

  // Same order as the SQL: by variant id, quantity checked first, then the variant, then stock.
  const sorted = [...items].sort((x, y) => cmp(String(x.variant_id), String(y.variant_id)));
  for (const item of sorted) {
    const qty = item.quantity;
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
      rollback();
      return fail("invalid quantity");
    }
    if (typeof item.variant_id !== "string" || !UUID_RE.test(item.variant_id)) {
      rollback();
      return fail('invalid input syntax for type uuid: "' + String(item.variant_id) + '"', "22P02");
    }
    const v = variants.find((x) => x.id === item.variant_id && x.store_id === a.p_store_id);
    const p = v && (t.products ?? []).find((x) => x.id === v.product_id && x.store_id === a.p_store_id);
    if (!v || !p || !p.active) {
      rollback();
      return fail("unknown_variant");
    }
    const soldOut = !!p.sold_out_until && new Date(p.sold_out_until) > now;
    if (v.stock_quantity < qty || soldOut) {
      rollback();
      return fail(`insufficient_stock:${p.name} ${v.label}`);
    }
    v.stock_quantity -= qty; // a dry run would not decrement; the pipeline never dry-runs customer chats
    const price = v.price_cents ?? p.price_cents;
    subtotal += price * qty;
    lines.push({ product_id: p.id, variant_id: v.id, name: p.name, label: v.label, qty, unit: price });
  }

  // The SQL inserts the order after the loop; its CHECKs (0010_orders_usage_delivery.sql) fail there,
  // after the stock changes, so they roll the stock back.
  const inRange = (s, min, max) => {
    const n = String(s ?? "").trim().length;
    return n >= min && n <= max;
  };
  const checks = [
    ["orders_customer_name_check", inRange(a.p_customer_name, 1, 120)],
    ["orders_address_check", inRange(a.p_address, 1, 300)],
    ["orders_phone_check", PHONE_CHECK.test(String(a.p_phone))],
  ];
  const broken = checks.find(([, ok]) => !ok);
  if (broken) {
    rollback();
    return fail(`new row for relation "orders" violates check constraint "${broken[0]}"`, "23514");
  }

  const seq = ++db.seq;
  const orderId = db.idFor(seq);
  const total = subtotal + fee;
  (t.orders ??= []).push({
    id: orderId,
    store_id: a.p_store_id,
    conversation_id: a.p_conversation_id,
    customer_id: a.p_customer_id,
    customer_name: String(a.p_customer_name).trim(),
    phone: a.p_phone,
    wilaya: String(a.p_wilaya).trim(),
    address: String(a.p_address).trim(),
    subtotal_cents: subtotal,
    delivery_fee_cents: fee,
    total_cents: total,
    idempotency_key: a.p_key,
    created_at: now.toISOString(),
    _seq: seq,
  });
  for (const l of lines) {
    (t.order_items ??= []).push({
      order_id: orderId,
      store_id: a.p_store_id,
      product_id: l.product_id,
      variant_id: l.variant_id,
      name: l.name,
      variant_label: l.label,
      quantity: l.qty,
      unit_price_cents: l.unit,
    });
  }
  return {
    data: { order_id: orderId, subtotal_cents: subtotal, delivery_fee_cents: fee, total_cents: total, duplicate: false },
    error: null,
  };
}

// Reply credits, as in creditRpc of testing/memdb.ts (0023_reply_credits.sql).
function replyCredits(db, name, a) {
  const store = (db.tables.stores ?? []).find((s) => s.id === a.p_store_id);
  if (name === "consume_reply_credit") {
    if (!store || Number(store.reply_credits ?? 0) <= 0) return { data: false, error: null };
    store.reply_credits = Number(store.reply_credits) - 1;
    return { data: true, error: null };
  }
  if (!store) return { data: null, error: null };
  store.reply_credits = Number(store.reply_credits ?? 0) + Number(a.p_n);
  return { data: store.reply_credits, error: null };
}

// Creates the fake client over `tables` (mutated in place). `seed` makes generated ids deterministic.
export function createFakeDb(tables, { seed = "db", clock = () => new Date() } = {}) {
  // Rows created by buildState have no insertion order yet: number them in table order.
  let seq = 0;
  for (const rows of Object.values(tables)) {
    for (const r of rows) r._seq ??= ++seq;
  }
  const db = {
    tables,
    seq,
    locks: new Set(),
    now: clock,
    idFor: (n) => uuidFor(`${seed}:row:${n}`),
    from(table) {
      return new Query(db, table);
    },
    rpc(name, a = {}) {
      const result = (() => {
        switch (name) {
          case "claim_conversation":
            if (db.locks.has(a.p_conversation_id)) return { data: false, error: null };
            db.locks.add(a.p_conversation_id);
            return { data: true, error: null };
          case "release_conversation":
            db.locks.delete(a.p_conversation_id);
            return { data: null, error: null };
          case "place_order":
            return placeOrder(db, a);
          case "consume_reply_credit":
          case "add_reply_credits":
            return replyCredits(db, name, a);
          default:
            return { data: null, error: { message: `fakedb: unknown rpc ${name}` } };
        }
      })();
      return Promise.resolve(result);
    },
  };
  return db;
}
