import assert from "node:assert/strict";
import { test } from "node:test";
import { syncYalidineFees } from "./sync.ts";
import { YalidineClient, YalidineError } from "./yalidine.ts";
import { encryptSecret } from "../meta/crypto.ts";
import { memDb, type Tables } from "../testing/memdb.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");
const STORE = "11111111-1111-1111-1111-111111111111";

async function tables(over: Partial<Tables> = {}, currency = "DZD"): Promise<Tables> {
  return {
    stores: [{ id: STORE, currency }],
    store_carriers: [{
      store_id: STORE, carrier: "yalidine", from_wilaya_id: 31, fee_type: "home",
      api_id_encrypted: await encryptSecret("ID", KEY), api_token_encrypted: await encryptSecret("TOK", KEY),
      last_synced_at: null, last_error: null,
    }],
    delivery_fees: [],
    ...over,
  };
}

const clientWith = (items: unknown[]) =>
  new YalidineClient({ id: "a", token: "b" }, {
    fetch: (() => Promise.resolve(new Response(JSON.stringify({ has_more: false, data: items })))) as unknown as typeof fetch,
  });

const items = [
  { to_wilaya_id: 16, per_commune: [{ express_home: 600 }] },
  { to_wilaya_id: 5, per_commune: [{ express_home: 800 }] },
];

test("adds missing wilayas in cents, updates synced ones, keeps manual fees", async () => {
  const t = await tables({
    delivery_fees: [
      { id: "f1", store_id: STORE, wilaya: "Alger", fee_cents: 50000, source: "manual" },
      { id: "f2", store_id: STORE, wilaya: "Batna", fee_cents: 70000, source: "yalidine" },
    ],
  });
  const r = await syncYalidineFees(memDb(t), STORE, { encryptionKey: KEY, client: clientWith(items) });
  assert.deepEqual(r, { ok: true, added: 0, updated: 1, skipped: 1 });
  assert.equal(t.delivery_fees.find((f) => f.id === "f1")!.fee_cents, 50000);
  assert.equal(t.delivery_fees.find((f) => f.id === "f2")!.fee_cents, 80000);
  assert.ok(t.store_carriers[0].last_synced_at);
});

test("overwrite replaces manual fees; new wilayas are inserted with the dashboard's name", async () => {
  const t = await tables({ delivery_fees: [{ id: "f1", store_id: STORE, wilaya: "الجزائر", fee_cents: 50000, source: "manual" }] });
  const r = await syncYalidineFees(memDb(t), STORE, { encryptionKey: KEY, client: clientWith(items), overwrite: true });
  assert.deepEqual(r, { ok: true, added: 1, updated: 1, skipped: 0 });
  assert.equal(t.delivery_fees.find((f) => f.id === "f1")!.fee_cents, 60000);
  const added = t.delivery_fees.find((f) => f.wilaya === "Batna")!;
  assert.deepEqual([added.fee_cents, added.source], [80000, "yalidine"]);
});

test("refuses stores that are not in dinars, and stores with no carrier", async () => {
  const eur = await tables({}, "EUR");
  assert.deepEqual(await syncYalidineFees(memDb(eur), STORE, { encryptionKey: KEY, client: clientWith(items) }), { ok: false, reason: "currency_mismatch" });
  const none = await tables({ store_carriers: [] });
  assert.deepEqual(await syncYalidineFees(memDb(none), STORE, { encryptionKey: KEY, client: clientWith(items) }), { ok: false, reason: "not_connected" });
});

test("a Yalidine error is recorded on the connection and leaves fees alone", async () => {
  const t = await tables();
  const failing = new YalidineClient({ id: "a", token: "b" }, {
    fetch: (() => Promise.resolve(new Response("{}", { status: 401 }))) as unknown as typeof fetch,
  });
  const r = await syncYalidineFees(memDb(t), STORE, { encryptionKey: KEY, client: failing });
  assert.deepEqual(r, { ok: false, reason: "bad_credentials" });
  assert.equal(t.store_carriers[0].last_error, "bad_credentials");
  assert.equal(t.delivery_fees.length, 0);
  assert.ok(YalidineError);
});
