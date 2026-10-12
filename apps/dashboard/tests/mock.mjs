// Tiny stand-in for Supabase (auth + PostgREST + realtime) so the UI can be exercised without the network.
import http from "node:http";
import crypto from "node:crypto";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "user-1", role: "authenticated", exp: 4102444800, aud: "authenticated" })}.sig`;
const user = { id: "user-1", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" };
const session = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: 4102444800, refresh_token: "r", user };

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

// Chat c5 has 250 messages, one a minute, so the newest page (100) and "Load earlier" both get exercised.
const longChat = { id: "c5", store_id: "s1", channel_id: "ch1", status: "closed", handoff_reason: null, last_customer_message_at: "2026-10-03T09:00:00Z", created_at: "2026-10-02T09:00:00Z", customers: { display_name: "Yasmine Long", platform_user_id: "ig-5" }, channels: { platform: "instagram" } };
const longThread = Array.from({ length: 250 }, (_, i) => ({ id: `L${i + 1}`, conversation_id: "c5", direction: i % 2 ? "outbound" : "inbound", sender: i % 2 ? "owner" : "customer", body: `Long thread message ${i + 1}`, created_at: new Date(Date.UTC(2026, 9, 2, 9, 0) + (i === 149 ? 150 : i) * 60000).toISOString(), delivery_status: i % 2 ? "sent" : null, delivery_error: null }));
// 60 more closed chats, added when state.bulk is set, so the inbox list needs "Load more".
const bulkChats = Array.from({ length: 60 }, (_, i) => ({ id: `b${i + 1}`, store_id: "s1", channel_id: "ch1", status: "closed", handoff_reason: null, last_customer_message_at: new Date(Date.UTC(2026, 8, 30) - i * 60000).toISOString(), created_at: "2026-09-30T00:00:00Z", customers: { display_name: `Bulk customer ${String(i + 1).padStart(2, "0")}`, platform_user_id: `bulk-${i + 1}` }, channels: { platform: "instagram" } }));

export const state = {
  hasStore: true,
  store: { id: "s1", name: "Demo Boutique", currency: "DZD", timezone: "Africa/Algiers", business_info: null, business_info_fields: null, agent_enabled: true, monthly_reply_limit: 1000, orders_enabled: false, created_at: "2026-10-01T00:00:00Z", trial_ends_at: new Date(Date.now() + 10 * 86400000).toISOString(), paid_until: null, plan_status: "trial", reply_credits: 120 },
  conversations: [
    { id: "c1", store_id: "s1", channel_id: "ch1", status: "human", handoff_reason: "Customer wants to order 2 hoodies", last_customer_message_at: "2026-10-04T20:30:00Z", created_at: "2026-10-04T20:00:00Z", customers: { display_name: "Amine", platform_user_id: "ig-0" }, channels: { platform: "instagram" } },
    { id: "c2", store_id: "s1", channel_id: "ch1", status: "bot", handoff_reason: null, last_customer_message_at: "2026-10-04T20:20:00Z", created_at: "2026-10-04T20:00:00Z", customers: { display_name: "Sara", platform_user_id: "ig-1" }, channels: { platform: "instagram" } },
    { id: "c4", store_id: "s1", channel_id: "ch1", status: "human", handoff_reason: "test handoff", last_customer_message_at: "2026-10-04T21:00:00Z", created_at: "2026-10-04T21:00:00Z", customers: { display_name: "Test chat", platform_user_id: "test-user-1-main" }, channels: { platform: "playground" } },
    { id: "c3", store_id: "s1", channel_id: "ch1", status: "closed", handoff_reason: null, last_customer_message_at: "2026-10-03T10:00:00Z", created_at: "2026-10-03T10:00:00Z", customers: { display_name: null, platform_user_id: "fb-9" }, channels: { platform: "facebook" } },
    longChat,
  ],
  messages: [
    ...longThread,
    { id: "m1", conversation_id: "c1", direction: "inbound", sender: "customer", body: "I want to order 2 hoodies", created_at: "2026-10-04T20:29:00Z", delivery_status: null },
    { id: "m2", conversation_id: "c1", direction: "outbound", sender: "agent", body: "The owner will reply to you personally.", created_at: "2026-10-04T20:29:30Z", delivery_status: "sent" },
    { id: "m3", conversation_id: "c2", direction: "inbound", sender: "customer", body: "هل عندكم هودي أسود؟", created_at: "2026-10-04T20:20:00Z", delivery_status: null },
  ],
  products: [
    { id: "p1", name: "Black Hoodie", description: "Heavy cotton", price_cents: 450000, active: true, aliases: null, stock_checked_at: ago(1), sold_out_until: null, product_variants: [
      { id: "v1", label: "S", price_cents: null, stock_quantity: 0, sku: null, updated_at: ago(1) },
      { id: "v2", label: "M", price_cents: null, stock_quantity: 3, sku: null, updated_at: ago(1) },
      { id: "v3", label: "L", price_cents: null, stock_quantity: 24, sku: null, updated_at: ago(1) } ] },
    { id: "p2", name: "Leather Wallet", description: null, price_cents: 320000, active: false, aliases: null, stock_checked_at: ago(60), sold_out_until: null, product_variants: [ { id: "v9", label: "Brown", price_cents: 350000, stock_quantity: 0, sku: null, updated_at: ago(60) } ] },
    { id: "p3", name: "Canvas Tote", description: null, price_cents: 120000, active: true, aliases: "sac, cabas", stock_checked_at: ago(30), sold_out_until: null, product_variants: [ { id: "v10", label: "Default", price_cents: null, stock_quantity: 12, sku: null, updated_at: ago(30) } ] },
  ],
  channels: [ { id: "ch1", platform: "playground", display_name: "Test chat", status: "active" } ],
  orders: [
    { id: "o1", customer_name: "Karim B", phone: "0555123456", wilaya: "Oran", address: "12 rue des Frères, Es Senia", subtotal_cents: 900000, delivery_fee_cents: 60000, total_cents: 960000, status: "pending", created_at: "2026-10-04T19:00:00Z",
      order_items: [ { id: "i1", name: "Black Hoodie", variant_label: "M", quantity: 2, unit_price_cents: 450000 } ] },
    { id: "o2", customer_name: "Lina S", phone: "0661000000", wilaya: "Alger", address: "Hydra", subtotal_cents: 320000, delivery_fee_cents: 40000, total_cents: 360000, status: "shipped", created_at: "2026-10-03T19:00:00Z",
      order_items: [ { id: "i2", name: "Leather Wallet", variant_label: "Brown", quantity: 1, unit_price_cents: 320000 } ] },
    // Older than 7 days: counted in the 30-day insights only.
    { id: "o3", customer_name: "Nadia K", phone: "0770000000", wilaya: "Blida", address: "Centre", subtotal_cents: 120000, delivery_fee_cents: 0, total_cents: 120000, status: "delivered", created_at: "2026-09-21T10:00:00Z",
      order_items: [ { id: "i3", name: "Canvas Tote", variant_label: "Default", quantity: 1, unit_price_cents: 120000 } ] },
  ],
  fees: [ { id: "f1", wilaya: "Alger", fee_cents: 40000 } ],
  faq: [ { id: "q1", question: "Do you gift wrap?", answer: "Yes, free of charge.", created_at: "2026-10-03T10:00:00Z" } ],
  testRuns: 0,
  realtimeJoins: 0, // postgres_changes subscriptions the dashboard has joined
  failStoreWrites: false, // true makes PATCH /stores fail, to test the pause switch's revert
  applyConversationPatch: false, // true makes PATCH /conversations change the stored chat (and push realtime)
  failSaveProductOnCall: 0, // n > 0 makes the n-th save_product call from now on fail (0 = off)
  failSaveProduct: false, // true makes the save_product RPC fail before writing anything
  rpcCalls: [], // every RPC call as {name, args}, for checks that need the parsed arguments
  bulk: false, // true adds bulkChats to the conversation lists
  deliverMode: "ok", // "fail" makes deliver-messages report a closed 24-hour window; "skip" leaves replies pending
  startStatus: 200, // 503 = Instagram connection not configured on the server
  insightsEmpty: false, // true makes store_insights report an empty window
  createStoreFail: false, // true makes create_store fail with a 500 (onboarding error alert)
  checkoutUrl: null, // URL that billing-checkout hands back (smoke points it at /settings?billing=success)
  telegramConnected: false, // telegram_link / telegram_unlink, only exercised when VITE_TELEGRAM_BOT_USERNAME is set
  usageExtra: 0, // replies sent in test chats; added to the assistant usage meter's base of 7
  log: [],
};

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS", "access-control-expose-headers": "*" };

// store_insights stand-in, built from the same rows the Inbox and Orders pages show: playground chats and
// cancelled orders are left out, and a handoff counts when the conversation has a handoff reason.
// The window is measured from a fixed day, not the clock, because the fixture dates are fixed. With that
// anchor the 7-day window holds the Oct 3-4 rows and the 30-day window also holds the Sep 21 order.
const INSIGHTS_NOW = Date.parse("2026-10-06T00:00:00Z");
const DAY_MS = 86400000;
export function insightsFixture(days) {
  const n = Math.min(Math.max(Number(days) || 7, 1), 90);
  const series = Array.from({ length: n }, (_, i) => ({
    day: new Date(INSIGHTS_NOW - (n - 1 - i) * DAY_MS).toISOString().slice(0, 10),
    conversations: 0, replies: 0, handoffs: 0, orders: 0, revenue_cents: 0,
  }));
  // Returns the day bucket for a timestamp, or null when it falls outside the window.
  const slot = (iso) => {
    const age = Math.floor((INSIGHTS_NOW - Date.parse(iso)) / DAY_MS);
    return age >= 0 && age < n ? series[n - 1 - age] : null;
  };
  const empty = state.insightsEmpty === true;
  const chats = empty ? [] : state.conversations.filter((c) => c.channels?.platform !== "playground");
  for (const c of chats) { const d = slot(c.created_at); if (d) d.conversations++; }
  for (const c of chats) { const d = c.handoff_reason ? slot(c.created_at) : null; if (d) d.handoffs++; }
  if (!empty) for (const m of state.messages) {
    if (m.direction !== "inbound" || m.sender !== "customer") continue;
    const d = slot(m.created_at); if (d) d.replies++;
  }
  const sales = empty ? [] : state.orders.filter((o) => o.status !== "cancelled");
  for (const o of sales) { const d = slot(o.created_at); if (d) { d.orders++; d.revenue_cents += o.total_cents; } }
  const totals = { conversations: 0, replies: 0, handoffs: 0, orders: 0, revenue_cents: 0 };
  for (const d of series) for (const k of Object.keys(totals)) totals[k] += d[k];
  const sold = new Map();
  for (const o of sales) {
    if (!slot(o.created_at)) continue;
    for (const i of o.order_items) sold.set(i.name, (sold.get(i.name) || 0) + i.quantity);
  }
  const top_products = [...sold].map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).slice(0, 5);
  return { days: series, totals, top_products, reply_credits: state.store.reply_credits };
}

// Realtime: a minimal Phoenix-channel websocket. It accepts joins, answers heartbeats, and can push
// a postgres_changes event for the conversations table to every joined client (see pushConversationChange).
const sockets = new Set();
let subId = 1000;

function frame(text) {
  const payload = Buffer.from(text);
  const head = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  return Buffer.concat([head, payload]);
}

// Client frames are masked. Returns the complete text messages and the unread remainder.
function decodeFrames(buf) {
  const msgs = [];
  let off = 0;
  while (buf.length - off >= 2) {
    const opcode = buf[off] & 0x0f;
    let len = buf[off + 1] & 0x7f;
    let p = off + 2;
    if (len === 126) { if (buf.length < p + 2) break; len = buf.readUInt16BE(p); p += 2; }
    if (len === 127) { if (buf.length < p + 8) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    const masked = (buf[off + 1] & 0x80) !== 0;
    let mask = null;
    if (masked) { if (buf.length < p + 4) break; mask = buf.subarray(p, p + 4); p += 4; }
    if (buf.length < p + len) break;
    const payload = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < len; i++) payload[i] ^= mask[i % 4];
    if (opcode === 1) msgs.push(payload.toString("utf8"));
    off = p + len;
  }
  return { msgs, rest: buf.subarray(off) };
}

function onUpgrade(req, socket, head) {
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  const conn = { socket, buf: Buffer.alloc(0), subs: [] };
  sockets.add(conn);
  socket.on("error", () => {});
  socket.on("close", () => sockets.delete(conn));
  const read = (chunk) => {
    const { msgs, rest } = decodeFrames(Buffer.concat([conn.buf, chunk]));
    conn.buf = rest;
    for (const m of msgs) handleRealtime(conn, JSON.parse(m));
  };
  // Frames sent right after the handshake can already be in `head` (bytes read with the request).
  if (head?.length) read(head);
  socket.on("data", read);
}

// Phoenix v2 frames (what supabase-js sends with vsn=2.0.0) are arrays: [join_ref, ref, topic, event, payload].
function handleRealtime(conn, raw) {
  const [joinRef, ref, topic, event, payload] = Array.isArray(raw) ? raw : [raw.join_ref, raw.ref, raw.topic, raw.event, raw.payload];
  const reply = (body) => conn.socket.write(frame(JSON.stringify([joinRef ?? null, ref ?? null, topic, "phx_reply", body])));
  if (event === "heartbeat") return reply({ status: "ok", response: {} });
  if (event === "phx_join") {
    const requested = payload?.config?.postgres_changes ?? [];
    const pg = requested.map((c) => ({ id: subId++, ...c }));
    for (const c of pg) conn.subs.push({ ...c, topic });
    state.realtimeJoins += pg.length;
    return reply({ status: "ok", response: { postgres_changes: pg } });
  }
}

// Tells every subscribed dashboard that rows of a table changed (as Supabase realtime would).
export function pushChange(table) {
  for (const conn of sockets) {
    for (const sub of conn.subs) {
      if (sub.table !== table) continue;
      const body = { ids: [sub.id], data: { schema: "public", table, type: "UPDATE", commit_timestamp: new Date().toISOString(), errors: null } };
      conn.socket.write(frame(JSON.stringify([null, null, sub.topic, "postgres_changes", body])));
    }
  }
}
export const pushConversationChange = () => pushChange("conversations");

// Changes one seeded chat's fields (status, handoff_reason), as the agent or the owner would, and tells
// the dashboard over realtime. Used for handoffs (a reason set) and owner replies (status human, reason null).
export function flipConversation(id, patch) {
  const c = state.conversations.find((x) => x.id === id);
  if (!c) throw new Error(`no conversation ${id}`);
  Object.assign(c, patch);
  pushConversationChange();
}

// The conversations the dashboard can see: the seeded ones, plus the bulk ones when state.bulk is set.
const convs = () => (state.bulk ? [...state.conversations, ...bulkChats] : state.conversations);

// The inbox_list RPC: one row per chat (playground excluded), newest customer message first, nulls last.
// Search matches the customer's name or any message body. Keyset cursor, as in migration 0024.
function inboxRows({ status = null, search = null, limit = 50, beforeAt = null, beforeId = null }) {
  const term = (search || "").trim().toLowerCase();
  const byId = (a, b) => b.localeCompare(a);
  const rows = convs()
    .filter((c) => c.channels?.platform !== "playground" && (!status || c.status === status))
    .map((c) => {
      const msgs = state.messages.filter((m) => m.conversation_id === c.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || byId(a.id, b.id));
      const last = msgs[0];
      return {
        id: c.id, status: c.status, handoff_reason: c.handoff_reason, last_customer_message_at: c.last_customer_message_at, created_at: c.created_at,
        customer_name: c.customers?.display_name ?? null, platform_user_id: c.customers?.platform_user_id ?? "", platform: c.channels?.platform ?? "",
        last_body: last?.body ?? null, last_direction: last?.direction ?? null, last_message_at: last?.created_at ?? null, _msgs: msgs,
      };
    })
    .filter((r) => !term || (r.customer_name ?? "").toLowerCase().includes(term) || r._msgs.some((m) => (m.body ?? "").toLowerCase().includes(term)));
  rows.sort((a, b) => {
    const x = a.last_customer_message_at, y = b.last_customer_message_at;
    if (x === y) return byId(a.id, b.id);
    if (x === null) return 1;
    if (y === null) return -1;
    return y.localeCompare(x) || byId(a.id, b.id);
  });
  const after = beforeId === null ? rows : rows.filter((r) => {
    if (beforeAt !== null) {
      return (r.last_customer_message_at !== null && (r.last_customer_message_at < beforeAt || (r.last_customer_message_at === beforeAt && r.id < beforeId)))
        || r.last_customer_message_at === null;
    }
    return r.last_customer_message_at === null && r.id < beforeId;
  });
  return after.slice(0, limit).map((r) => {
    const row = { ...r };
    delete row._msgs;
    return row;
  });
}

// PostgREST ilike pattern (* is the wildcard) as a regular expression. A backslash escapes the next character.
const escapeRe = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function likeRegex(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\" && i + 1 < pattern.length) re += escapeRe(pattern[++i]);
    else if (ch === "%") re += ".*";
    else if (ch === "_") re += ".";
    else re += escapeRe(ch);
  }
  return new RegExp(`^${re}$`, "is");
}
// An or=(col.ilike."*term*",...) filter: true when any column matches. Quoted values are unescaped first.
function matchOr(or, row) {
  const re = /([a-z_]+)\.ilike\."((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(or))) {
    const value = m[2].replace(/\\(.)/g, "$1").replace(/\*/g, "%");
    if (likeRegex(value).test(String(row[m[1]] ?? ""))) return true;
  }
  return false;
}

export function start(port = Number(process.env.MOCK_PORT || 54321)) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code, data, extra = {}) => { res.writeHead(code, { "content-type": "application/json", ...cors, ...extra }); res.end(data === undefined ? "" : JSON.stringify(data)); };
      if (req.method === "OPTIONS") return send(204);
      const single = (req.headers.accept || "").includes("vnd.pgrst.object");
      const table = url.pathname.replace("/rest/v1/", "");
      state.log.push(`${req.method} ${url.pathname}${url.search.slice(0, 60)} ${body.slice(0, 600)}`);

      if (url.pathname === "/auth/v1/token") return send(200, session);
      if (url.pathname === "/auth/v1/user") return send(200, user);
      if (url.pathname === "/auth/v1/otp") return send(200, {});
      if (url.pathname === "/auth/v1/recover") return send(200, {});
      if (url.pathname === "/auth/v1/signup") return send(200, { ...user, identities: [] });
      if (url.pathname === "/auth/v1/logout") return send(204);

      if (url.pathname.startsWith("/rest/v1/rpc/create_store")) {
        if (state.createStoreFail) return send(500, { message: "create failed" });
        state.hasStore = true; return send(200, "s1");
      }
      if (url.pathname.startsWith("/rest/v1/rpc/telegram_link")) return send(200, { connected: state.telegramConnected, code: "tg-code-123" });
      if (url.pathname.startsWith("/rest/v1/rpc/telegram_unlink")) { state.telegramConnected = false; return send(204); }
      if (url.pathname === "/functions/v1/billing-checkout") {
        if (req.method !== "POST") return send(204);
        return send(200, { checkout_url: state.checkoutUrl });
      }
      // save_product replaces the product's full state and drops variants missing from the list, like
      // the real function. It builds the new state first and writes only when everything is valid.
      if (url.pathname.startsWith("/rest/v1/rpc/save_product")) {
        const args = JSON.parse(body || "{}");
        state.rpcCalls.push({ name: "save_product", args });
        if (state.failSaveProductOnCall > 0 && --state.failSaveProductOnCall === 0) return send(500, { code: "P0001", message: "simulated failure", details: null, hint: null });
        if (state.failSaveProduct) return send(500, { code: "P0001", message: "simulated failure", details: null, hint: null });
        const prev = state.products.find((x) => x.id === args.p_product_id);
        const now = new Date().toISOString();
        const variants = args.p_variants.map((v, i) => ({
          id: v.id || `v-new-${state.products.length}-${i}`, label: v.label || "Default", price_cents: v.price_cents ?? null,
          stock_quantity: v.stock_quantity ?? 0, sku: null, updated_at: now,
        }));
        const product = {
          id: prev ? prev.id : `p-new-${state.products.length + 1}`,
          name: args.p_product.name, description: args.p_product.description, aliases: args.p_product.aliases,
          price_cents: args.p_product.price_cents, active: args.p_product.active ?? prev?.active ?? true,
          stock_checked_at: prev ? prev.stock_checked_at : now, sold_out_until: prev ? prev.sold_out_until : null,
          product_variants: variants,
        };
        if (prev) Object.assign(prev, product); else state.products.push(product);
        return send(200, product.id);
      }
      // adjust_stock is a relative change, floored at zero. It returns the stored quantity.
      if (url.pathname.startsWith("/rest/v1/rpc/adjust_stock")) {
        const args = JSON.parse(body || "{}");
        state.rpcCalls.push({ name: "adjust_stock", args });
        const v = state.products.flatMap((p) => p.product_variants).find((x) => x.id === args.p_variant_id);
        if (!v) return send(400, { code: "P0002", message: "variant not found", details: null, hint: null });
        v.stock_quantity = Math.max(0, v.stock_quantity + args.p_delta);
        v.updated_at = new Date().toISOString();
        return send(200, v.stock_quantity);
      }
      if (url.pathname.startsWith("/rest/v1/rpc/inbox_list")) {
        const { p_status, p_search, p_limit, p_before_at, p_before_id } = JSON.parse(body || "{}");
        return send(200, inboxRows({ status: p_status, search: p_search, limit: p_limit ?? 50, beforeAt: p_before_at ?? null, beforeId: p_before_id ?? null }));
      }
      if (url.pathname.startsWith("/rest/v1/rpc/store_insights")) {
        const { p_days } = JSON.parse(body || "{}");
        return send(200, insightsFixture(p_days));
      }
      if (url.pathname.startsWith("/rest/v1/rpc/set_order_status")) {
        const { p_order_id, p_status } = JSON.parse(body);
        const o = state.orders.find((x) => x.id === p_order_id);
        if (o) o.status = p_status;
        return send(200, p_status);
      }
      if (url.pathname === "/functions/v1/assistant-chat") {
        if (req.method !== "POST") return send(204);
        const payload = JSON.parse(body || "{}");
        if (payload.action === "usage") return send(200, { usage: { used: 7 + state.usageExtra, limit: 1000, remaining: 993 - state.usageExtra, exceeded: false, nearLimit: false, conversations: 3 } });
        const { text = "" } = payload;
        state.testRuns++;
        state.usageExtra++;
        if (/human/i.test(text)) return send(200, { ok: true, reply: "Thanks! I've passed this to the owner.", status: "human", handoff: "asked for a human", tool_calls: ["handoff_to_owner"], fast_path: false });
        if (/hello/i.test(text)) return send(200, { ok: true, reply: "Hi, welcome to Demo Boutique! How can I help you?", status: "bot", tool_calls: [], fast_path: true });
        if (/order/i.test(text)) return send(200, { ok: true, reply: "Your order is received. Total 9 600 DA on delivery.", status: "bot", tool_calls: ["create_order"], fast_path: false });
        if (/spam/i.test(text)) return send(429, { error: "Too many test messages. Try again later." });
        return send(200, { ok: true, reply: "Yes, the Black Hoodie in M is available (3 left).", status: "bot", tool_calls: ["search_products"], fast_path: false });
      }
      if (url.pathname === "/functions/v1/deliver-messages") {
        if (req.method !== "POST") return send(204);
        const { conversation_id } = JSON.parse(body || "{}");
        let sent = 0, failed = 0;
        for (const m of state.messages) {
          if (m.conversation_id !== conversation_id || m.direction !== "outbound" || m.delivery_status !== "pending") continue;
          if (state.deliverMode === "skip") continue;
          if (state.deliverMode === "fail") { m.delivery_status = "failed"; m.delivery_error = "Instagram only allows a reply within 24 hours of the customer's last message."; failed++; }
          else { m.delivery_status = "sent"; sent++; }
        }
        return send(200, { sent, failed, skipped: 0 });
      }
      if (url.pathname === "/functions/v1/instagram-connect") {
        if (req.method !== "POST") return send(204);
        const { action, channel_id, code } = JSON.parse(body || "{}");
        if (action === "start") {
          if (state.startStatus !== 200) return send(state.startStatus, { error: "not_configured" });
          // The real function returns Instagram's approval page; the mock returns the page Instagram
          // (through the function's callback) would send the owner back to.
          return send(200, { url: `http://127.0.0.1:${process.env.TEST_PORT || 4173}/assistant?instagram=finish&code=ig-code&state=signed-state` });
        }
        if (action === "finish") {
          if (code !== "ig-code") return send(200, { ok: false, reason: "invalid_state" });
          if (!state.channels.some((c) => c.platform === "instagram")) state.channels.push({ id: "ch-ig", platform: "instagram", display_name: "@fennec_vision_", status: "active" });
          else state.channels.find((c) => c.platform === "instagram").status = "active";
          return send(200, { ok: true });
        }
        if (action === "disconnect") {
          const c = state.channels.find((x) => x.id === channel_id);
          if (c) c.status = "disconnected";
          return send(200, { ok: true });
        }
        return send(400, { error: "Unknown action" });
      }
      if (!url.pathname.startsWith("/rest/v1/")) return send(404, { message: "not found" });

      const pick = (rows) => single ? (rows[0] ? send(200, rows[0]) : send(406, { code: "PGRST116", message: "no rows", details: "", hint: "" })) : send(200, rows);
      if (req.method === "HEAD" && table === "products") return send(200, undefined, { "content-range": `*/${state.products.filter((p) => p.active).length}` });
      if (req.method === "HEAD" && table === "conversations") {
        // Count-only queries (the Needs-you badge, the inbox tab counts). Test chats are never counted.
        const status = url.searchParams.get("status");
        const n = convs().filter((c) => c.channels?.platform !== "playground" && (!status || `eq.${c.status}` === status)).length;
        return send(200, undefined, { "content-range": `*/${n}` });
      }
      if (req.method === "HEAD" && table === "orders") {
        const status = url.searchParams.get("status");
        const n = state.orders.filter((o) => !status || `eq.${o.status}` === status).length;
        return send(200, undefined, { "content-range": `*/${n}` });
      }
      if (req.method === "HEAD" && table === "channels") {
        const n = state.channels.filter((c) => c.platform !== "playground" && c.status === "active").length;
        return send(200, undefined, { "content-range": `*/${n}` });
      }
      if (req.method === "HEAD" && table === "agent_runs") {
        const n = url.search.includes("source=eq.test") ? state.testRuns : url.search.includes("not.is.null") ? 2 : 7;
        return send(200, undefined, { "content-range": `*/${n}` });
      }
      if (req.method === "GET") {
        if (table === "orders") {
          // Status tab, the name/phone search, and offset/limit paging (postgrest-js range()), newest first.
          let rows = state.orders;
          const status = url.searchParams.get("status");
          if (status) rows = rows.filter((o) => `eq.${o.status}` === status);
          const or = url.searchParams.get("or");
          if (or) rows = rows.filter((o) => matchOr(or, o));
          rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = url.searchParams.get("limit");
          return pick(rows.slice(offset, limit ? offset + Number(limit) : undefined));
        }
        if (table === "faq_entries") return pick(state.faq);
        if (table === "delivery_fees") return pick(state.fees);
        if (table === "store_members") return pick(state.hasStore ? [{ store_id: "s1" }] : []);
        if (table === "stores") return pick([state.store]);
        if (table === "conversations") {
          const id = url.searchParams.get("id");
          const status = url.searchParams.get("status");
          let rows = convs();
          if (id) rows = rows.filter((c) => `eq.${c.id}` === id);
          if (status) rows = rows.filter((c) => `eq.${c.status}` === status);
          // The handoff alert query: chats with a handoff reason, test chats left out.
          if (url.searchParams.get("handoff_reason") === "not.is.null") rows = rows.filter((c) => c.handoff_reason !== null);
          if (url.searchParams.get("channels.platform") === "neq.playground") rows = rows.filter((c) => c.channels?.platform !== "playground");
          return pick(rows);
        }
        if (table === "messages") {
          const cid = url.searchParams.get("conversation_id");
          let rows = state.messages;
          if (cid && cid.startsWith("in.")) { const ids = cid.slice(4, -1).split(","); rows = rows.filter((m) => ids.includes(m.conversation_id)); }
          else if (cid) rows = rows.filter((m) => `eq.${m.conversation_id}` === cid);
          // Oldest first unless ordered desc; ties broken by id, as the dashboard asks. "lt" = created before a time.
          const desc = (url.searchParams.get("order") || "").includes("created_at.desc");
          const before = url.searchParams.get("created_at");
          if (before?.startsWith("lt.")) rows = rows.filter((m) => m.created_at < before.slice(3));
          // or=(created_at.lt."X",and(created_at.eq."X",id.lt."Y")): older than X, or same time with a smaller id.
          const orp = url.searchParams.get("or");
          const om = orp && orp.match(/^\(created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\."([^"]+)"\)\)$/);
          if (om) rows = rows.filter((m) => m.created_at < om[1] || (m.created_at === om[2] && m.id < om[3]));
          rows = [...rows].sort((a, b) => (a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)) * (desc ? -1 : 1));
          const limit = url.searchParams.get("limit");
          return pick(limit ? rows.slice(0, Number(limit)) : rows);
        }
        if (table === "products") return pick(state.products);
        if (table === "channels") return pick(state.channels);
      }
      if (req.method === "POST" && table === "messages") {
        const row = JSON.parse(body);
        state.messages.push({ id: "m" + (state.messages.length + 1), created_at: new Date().toISOString(), ...row });
        pushChange("messages");
        return send(201);
      }
      if (req.method === "POST" && table === "products") return send(201, [{ id: "p-new" }]);
      if (req.method === "POST" && table === "faq_entries") {
        const row = JSON.parse(body);
        state.faq.unshift({ id: "q" + (state.faq.length + 1), created_at: new Date().toISOString(), ...row });
        return send(201);
      }
      if (req.method === "DELETE" && table === "faq_entries") {
        const id = (url.searchParams.get("id") || "").replace("eq.", "");
        state.faq = state.faq.filter((f) => f.id !== id);
        return send(204);
      }
      if (req.method === "DELETE" && table === "delivery_fees") {
        const id = (url.searchParams.get("id") || "").replace("eq.", "");
        state.fees = state.fees.filter((f) => f.id !== id);
        return send(204);
      }
      if (req.method === "POST" && table === "delivery_fees") {
        const rows = [].concat(JSON.parse(body));
        for (const r of rows) state.fees.push({ id: "f" + (state.fees.length + 1), wilaya: r.wilaya, fee_cents: r.fee_cents });
        return send(201);
      }
      if (req.method === "PATCH" && table === "stores") {
        if (state.failStoreWrites) return send(500, { message: "write failed" });
        Object.assign(state.store, JSON.parse(body));
        return send(204);
      }
      if (req.method === "PATCH" && table === "conversations" && state.applyConversationPatch) {
        const cid = (url.searchParams.get("id") || "").replace(/^eq\./, "");
        const c = state.conversations.find((x) => x.id === cid);
        if (c) { Object.assign(c, JSON.parse(body || "{}")); pushConversationChange(); }
        return send(204);
      }
      if (req.method === "PATCH" || req.method === "POST" || req.method === "DELETE") return send(204);
      return send(404, { message: "unhandled " + req.method + " " + table });
    });
  });
  server.on("upgrade", onUpgrade);
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
