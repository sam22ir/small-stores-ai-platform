import { productView } from "./catalog.ts";
import { formatFaq } from "./faq.ts";
import { createOrder } from "./order.ts";
import { asRecord, money, UUID } from "./shared.ts";
import type { ToolContext, ToolOutcome } from "./shared.ts";

export async function executeTool(
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const args = asRecord(input);
  const { store, catalog } = ctx;
  const now = ctx.now ?? new Date();

  switch (name) {
    case "search_products": {
      if (typeof args.query !== "string") {
        return { content: "query must be a string", isError: true };
      }
      const products = await catalog.searchProducts(
        store.id,
        args.query.slice(0, 200),
        5,
      );
      if (products.length === 0) {
        return {
          content: JSON.stringify({
            results: [],
            note: "No matching products. Don't guess; offer to check with the owner.",
          }),
        };
      }
      return {
        content: JSON.stringify({
          results: products.map((p) => productView(p, store.currency, now, !!store.orders_enabled)),
        }),
      };
    }

    case "check_stock": {
      if (typeof args.product_id !== "string" || !UUID.test(args.product_id)) {
        return {
          content: "product_id must come from search_products. Search first.",
          isError: true,
        };
      }
      const product = await catalog.getProduct(store.id, args.product_id);
      if (!product) {
        return {
          content: "Unknown product_id. Call search_products to find it.",
          isError: true,
        };
      }
      return {
        content: JSON.stringify(productView(product, store.currency, now, !!store.orders_enabled)),
      };
    }

    case "get_store_info": {
      const faq = ctx.faq ? await ctx.faq.list(store.id) : [];
      return {
        content: JSON.stringify({
          store_name: store.name,
          currency: store.currency,
          owner_notes: store.business_info ??
            "The owner hasn't written any extra store information.",
          ...(faq.length ? { owner_faq: formatFaq(faq) } : {}),
        }),
      };
    }

    case "handoff_to_owner": {
      const reason = typeof args.reason === "string" && args.reason.trim()
        ? args.reason.trim().slice(0, 300)
        : "Customer needs the owner";
      const summary = typeof args.summary === "string" ? args.summary.trim().slice(0, 400) : "";
      return {
        content:
          "Conversation handed to the owner. Tell the customer, in one short sentence, that the owner will reply personally.",
        handoffReason: reason,
        handoffSummary: summary || null,
      };
    }

    case "quote_delivery": {
      if (!store.orders_enabled || !ctx.orders) {
        return { content: "Ordering is not available.", isError: true };
      }
      if (typeof args.wilaya !== "string" || !args.wilaya.trim()) {
        return { content: "wilaya must be a non-empty string", isError: true };
      }
      const q = await ctx.orders.quoteDelivery(store.id, args.wilaya.trim().slice(0, 60));
      if (!q.served) {
        return {
          content: JSON.stringify({
            delivers: false,
            wilayas_served: q.options,
            note: "No match. If the customer's wilaya is one of wilayas_served under another spelling, call quote_delivery again with that exact name. Otherwise tell the customer the store doesn't deliver there and offer to ask the owner (handoff_to_owner).",
          }),
        };
      }
      return {
        content: JSON.stringify(
          q.fee_cents === null
            ? {
              delivers: true,
              delivery_fee: "not set",
              note: "The owner hasn't set a delivery fee. Say the owner will confirm it, and don't invent a number.",
            }
            : {
              delivers: true,
              wilaya: q.canonical,
              delivery_fee: money(q.fee_cents, store.currency),
            },
        ),
      };
    }

    case "create_order":
      return await createOrder(args, ctx);

    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}
