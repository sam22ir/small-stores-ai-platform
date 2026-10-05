// Tiny stand-in for Supabase (auth + PostgREST) so the UI can be exercised without the network.
import http from "node:http";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "user-1", role: "authenticated", exp: 4102444800, aud: "authenticated" })}.sig`;
const user = { id: "user-1", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" };
const session = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: 4102444800, refresh_token: "r", user };

const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

export const state = {
  hasStore: true,
  store: { id: "s1", name: "Demo Boutique", currency: "DZD", timezone: "Africa/Algiers", business_info: null, business_info_fields: null, agent_enabled: true, monthly_reply_limit: 1000, orders_enabled: false, created_at: "2026-10-01T00:00:00Z" },
  conversations: [
    { id: "c1", store_id: "s1", channel_id: "ch1", status: "human", handoff_reason: "Customer wants to order 2 hoodies", last_customer_message_at: "2026-10-04T20:30:00Z", created_at: "2026-10-04T20:00:00Z", customers: { display_name: "Amine", platform_user_id: "ig-0" }, channels: { platform: "instagram" } },
    { id: "c2", store_id: "s1", channel_id: "ch1", status: "bot", handoff_reason: null, last_customer_message_at: "2026-10-04T20:20:00Z", created_at: "2026-10-04T20:00:00Z", customers: { display_name: "Sara", platform_user_id: "ig-1" }, channels: { platform: "instagram" } },
    { id: "c4", store_id: "s1", channel_id: "ch1", status: "human", handoff_reason: "test handoff", last_customer_message_at: "2026-10-04T21:00:00Z", created_at: "2026-10-04T21:00:00Z", customers: { display_name: "Test chat", platform_user_id: "test-user-1-main" }, channels: { platform: "playground" } },
    { id: "c3", store_id: "s1", channel_id: "ch1", status: "closed", handoff_reason: null, last_customer_message_at: "2026-10-03T10:00:00Z", created_at: "2026-10-03T10:00:00Z", customers: { display_name: null, platform_user_id: "fb-9" }, channels: { platform: "facebook" } },
  ],
  messages: [
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
  ],
  fees: [ { id: "f1", wilaya: "Alger", fee_cents: 40000 } ],
  faq: [ { id: "q1", question: "Do you gift wrap?", answer: "Yes, free of charge.", created_at: "2026-10-03T10:00:00Z" } ],
  testRuns: 0,
  log: [],
};

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS", "access-control-expose-headers": "*" };

export function start(port = 54321) {
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
      if (url.pathname === "/auth/v1/signup") return send(200, { ...user, identities: [] });
      if (url.pathname === "/auth/v1/logout") return send(204);

      if (url.pathname.startsWith("/rest/v1/rpc/create_store")) { state.hasStore = true; return send(200, "s1"); }
      if (url.pathname.startsWith("/rest/v1/rpc/set_order_status")) {
        const { p_order_id, p_status } = JSON.parse(body);
        const o = state.orders.find((x) => x.id === p_order_id);
        if (o) o.status = p_status;
        return send(200, p_status);
      }
      if (url.pathname === "/functions/v1/assistant-chat") {
        if (req.method !== "POST") return send(204);
        const { text = "" } = JSON.parse(body || "{}");
        state.testRuns++;
        if (/human/i.test(text)) return send(200, { ok: true, reply: "Thanks! I've passed this to the owner.", status: "human", handoff: "asked for a human", tool_calls: ["handoff_to_owner"], fast_path: false });
        if (/hello/i.test(text)) return send(200, { ok: true, reply: "Hi, welcome to Demo Boutique! How can I help you?", status: "bot", tool_calls: [], fast_path: true });
        if (/order/i.test(text)) return send(200, { ok: true, reply: "Your order is received. Total 9 600 DA on delivery.", status: "bot", tool_calls: ["create_order"], fast_path: false });
        if (/spam/i.test(text)) return send(429, { error: "Too many test messages. Try again later." });
        return send(200, { ok: true, reply: "Yes, the Black Hoodie in M is available (3 left).", status: "bot", tool_calls: ["search_products"], fast_path: false });
      }
      if (!url.pathname.startsWith("/rest/v1/")) return send(404, { message: "not found" });

      const pick = (rows) => single ? (rows[0] ? send(200, rows[0]) : send(406, { code: "PGRST116", message: "no rows", details: "", hint: "" })) : send(200, rows);
      if (req.method === "HEAD" && table === "products") return send(200, undefined, { "content-range": `*/${state.products.filter((p) => p.active).length}` });
      if (req.method === "HEAD" && table === "agent_runs") {
        const n = url.search.includes("source=eq.test") ? state.testRuns : url.search.includes("not.is.null") ? 2 : 7;
        return send(200, undefined, { "content-range": `*/${n}` });
      }
      if (req.method === "GET") {
        if (table === "orders") return pick(state.orders);
        if (table === "faq_entries") return pick(state.faq);
        if (table === "delivery_fees") return pick(state.fees);
        if (table === "store_members") return pick(state.hasStore ? [{ store_id: "s1" }] : []);
        if (table === "stores") return pick([state.store]);
        if (table === "conversations") {
          const id = url.searchParams.get("id");
          return pick(id ? state.conversations.filter((c) => `eq.${c.id}` === id) : state.conversations);
        }
        if (table === "messages") {
          const cid = url.searchParams.get("conversation_id");
          let rows = state.messages;
          if (cid && cid.startsWith("in.")) { const ids = cid.slice(4, -1).split(","); rows = rows.filter((m) => ids.includes(m.conversation_id)); }
          else if (cid) rows = rows.filter((m) => `eq.${m.conversation_id}` === cid);
          const order = url.searchParams.get("order") || "";
          if (order.includes("created_at.desc")) rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
          return pick(rows);
        }
        if (table === "products") return pick(state.products);
        if (table === "channels") return pick(state.channels);
      }
      if (req.method === "POST" && table === "messages") {
        const row = JSON.parse(body);
        state.messages.push({ id: "m" + (state.messages.length + 1), created_at: new Date().toISOString(), ...row });
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
      if (req.method === "POST" && table === "delivery_fees") {
        const rows = [].concat(JSON.parse(body));
        for (const r of rows) state.fees.push({ id: "f" + (state.fees.length + 1), wilaya: r.wilaya, fee_cents: r.fee_cents });
        return send(201);
      }
      if (req.method === "PATCH" && table === "stores") { Object.assign(state.store, JSON.parse(body)); return send(204); }
      if (req.method === "PATCH" || req.method === "POST" || req.method === "DELETE") return send(204);
      return send(404, { message: "unhandled " + req.method + " " + table });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
