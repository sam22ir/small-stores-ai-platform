import type { SupabaseClient } from "@supabase/supabase-js";
import { scoreProduct, searchGroups } from "../agent/search.ts";
import { matchWilaya } from "../agent/wilaya.ts";
import type {
  Catalog,
  DeliveryQuote,
  FaqPort,
  OrderPort,
  PlaceOrderInput,
  PlaceOrderResult,
  ProductRecord,
} from "../agent/types.ts";

// --- Catalog -----------------------------------------------------------------

const PRODUCT_SELECT =
  "id,name,description,price_cents,aliases,sold_out_until,product_variants(id,label,price_cents,stock_quantity)";

// deno-lint-ignore no-explicit-any
function toProduct(row: any): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price_cents: row.price_cents,
    aliases: row.aliases ?? null,
    sold_out_until: row.sold_out_until ?? null,
    variants: row.product_variants ?? [],
  };
}

export function supabaseCatalog(client: SupabaseClient): Catalog {
  return {
    async searchProducts(storeId, query, limit) {
      // Variants are letters/digits only, so they're safe inside the filter string.
      const groups = searchGroups(query);

      let q = client
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("store_id", storeId)
        .eq("active", true);
      if (groups.length) {
        q = q.or(
          groups.flat().flatMap((v) => [
            `name.ilike.*${v}*`,
            `description.ilike.*${v}*`,
            `aliases.ilike.*${v}*`,
          ])
            .join(","),
        );
      }
      const { data, error } = await q.order("name").limit(50);
      if (error) throw error;

      return (data ?? []).map(toProduct)
        .sort((a, b) =>
          scoreProduct(b.name, b.description, groups, b.aliases) -
          scoreProduct(a.name, a.description, groups, a.aliases)
        )
        .slice(0, limit);
    },

    async getProduct(storeId, productId) {
      const { data, error } = await client
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("id", productId)
        .eq("store_id", storeId)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data ? toProduct(data) : null;
    },
  };
}

// --- FAQ ---------------------------------------------------------------------

// The owner's saved answers, newest first (the tool trims them to a size budget).
export function supabaseFaq(client: SupabaseClient): FaqPort {
  return {
    async list(storeId) {
      const { data, error } = await client
        .from("faq_entries")
        .select("question,answer")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  };
}

// --- Orders ------------------------------------------------------------------

const key = (wilaya: string) => wilaya.trim().toLowerCase();

// dryRun: validates and prices an order but writes nothing (dashboard test chats).
export function supabaseOrders(client: SupabaseClient, dryRun: boolean): OrderPort {
  return {
    async quoteDelivery(storeId, wilaya): Promise<DeliveryQuote> {
      const { data, error } = await client
        .from("delivery_fees")
        .select("wilaya,fee_cents")
        .eq("store_id", storeId)
        .order("wilaya");
      if (error) throw error;
      if (!data || data.length === 0) return { served: true, fee_cents: null };
      const names = data.map((r) => r.wilaya);
      const exact = data.find((r) => key(r.wilaya) === key(wilaya));
      const hit = exact ?? data.find((r) => r.wilaya === matchWilaya(wilaya, names));
      if (!hit) {
        return { served: false, fee_cents: null, options: names };
      }
      return { served: true, fee_cents: hit.fee_cents, canonical: hit.wilaya };
    },

    async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
      // Send the store's own spelling of the wilaya so the RPC's fee lookup matches.
      const { data: fees } = await client
        .from("delivery_fees")
        .select("wilaya")
        .eq("store_id", input.storeId);
      const wilaya = matchWilaya(input.wilaya, (fees ?? []).map((r) => r.wilaya)) ?? input.wilaya;
      const { data, error } = await client.rpc("place_order", {
        p_store_id: input.storeId,
        p_conversation_id: input.conversationId,
        p_customer_id: input.customerId,
        p_customer_name: input.customerName,
        p_phone: input.phone,
        p_wilaya: wilaya,
        p_address: input.address,
        p_items: input.items,
        p_key: input.key,
        p_dry_run: dryRun,
      });
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("wilaya_not_served")) return { ok: false, code: "wilaya_not_served" };
        if (msg.includes("unknown_variant")) return { ok: false, code: "unknown_variant" };
        const stock = msg.match(/insufficient_stock:(.*)/);
        if (stock) return { ok: false, code: "insufficient_stock", detail: stock[1].trim() };
        if (error.code === "P0001" || error.code === "23514" || error.code === "22P02") {
          return { ok: false, code: "invalid", detail: msg.slice(0, 200) };
        }
        throw error;
      }
      return {
        ok: true,
        order_id: data.order_id ?? "test-order",
        subtotal_cents: data.subtotal_cents,
        delivery_fee_cents: data.delivery_fee_cents,
        total_cents: data.total_cents,
        duplicate: !!data.duplicate,
      };
    },
  };
}
