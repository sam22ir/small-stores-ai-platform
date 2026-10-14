// Builds the in-memory database state for one stress case from fixture.json.
// Every case gets its own fresh state, so cases never see each other's orders or stock.
import { createHash } from "node:crypto";

export const SUPABASE_URL = "https://example.supabase.co";

// Deterministic UUID (v5-shaped) so ids are stable across runs and pass the UUID checks in the tools.
export function uuidFor(seed) {
  const h = createHash("sha1").update(`wakil-stress:${seed}`).digest("hex").slice(0, 32).split("");
  h[12] = "5";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// "Basket blanche" -> "basket-blanche": the photo file name in the product-images bucket.
export function photoSlug(name) {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(
    /^-|-$/g,
    "",
  );
}

export function buildState(fixture, caseId) {
  const seed = (suffix) => uuidFor(`${caseId}:${suffix}`);
  const storeId = seed("store");
  const channelId = seed("channel");
  const customerId = seed("customer");
  const conversationId = seed("conversation");
  const s = fixture.store;

  const tables = {
    stores: [{ id: storeId, name: s.name, currency: s.currency, reply_credits: 0 }],
    products: [],
    product_variants: [],
    delivery_fees: (fixture.delivery_fees ?? []).map((f) => ({
      store_id: storeId,
      wilaya: f.wilaya,
      fee_cents: f.fee_cents,
    })),
    faq_entries: (fixture.faq ?? []).map((f, i) => ({
      store_id: storeId,
      question: f.question,
      answer: f.answer,
      created_at: new Date(Date.UTC(2026, 0, 1) + i).toISOString(),
    })),
    customers: [{ id: customerId, store_id: storeId, display_name: "Client test" }],
    conversations: [{
      id: conversationId,
      store_id: storeId,
      customer_id: customerId,
      channel_id: channelId,
      status: "bot",
      handoff_reason: null,
      handoff_summary: null,
    }],
    messages: [],
    agent_runs: [],
    orders: [],
    order_items: [],
    store_ai_cap_alerts: [],
  };

  for (const p of fixture.products) {
    const productId = seed(`product:${p.name}`);
    tables.products.push({
      id: productId,
      store_id: storeId,
      name: p.name,
      description: p.description ?? null,
      price_cents: p.price_cents,
      aliases: p.aliases ?? null,
      active: p.active !== false,
      sold_out_until: null,
      image_url: p.has_photo
        ? `${SUPABASE_URL}/storage/v1/object/public/product-images/${storeId}/${photoSlug(p.name)}.jpg`
        : null,
    });
    for (const v of p.variants) {
      tables.product_variants.push({
        id: seed(`variant:${p.name}:${v.label}`),
        product_id: productId,
        store_id: storeId,
        label: v.label,
        price_cents: v.price_cents ?? null,
        stock_quantity: v.stock,
      });
    }
  }

  // Store settings exactly as the webhook loads them (see pipeline/types.ts StoreSettings).
  // Limits are set so they never trigger: the stress run is about the reply, not the caps.
  const store = {
    id: storeId,
    name: s.name,
    currency: s.currency,
    business_info: s.business_info ?? null,
    agent_enabled: s.agent_enabled !== false,
    orders_enabled: !!s.orders_enabled,
    reply_tone: s.reply_tone ?? "friendly",
    reply_emoji: !!s.reply_emoji,
    monthly_reply_limit: 1_000_000,
    ai_monthly_token_limit: null,
    reply_credits: 0,
  };

  return {
    tables,
    store,
    ids: { storeId, channelId, customerId, conversationId },
    seed,
  };
}
