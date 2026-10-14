import { productView } from "./catalog.ts";
import { formatFaq } from "./faq.ts";
import { sendProductPhoto } from "./photo.ts";
import { createOrder } from "./order.ts";
import { normalizeDzPhone } from "../orders.ts";
import { deliveryFeeSummary } from "./store-info.ts";
import { asRecord, money, UUID } from "./shared.ts";
import type { ToolContext, ToolOutcome } from "./shared.ts";

const PHONE_FIRST =
  "The phone number is missing or not a valid Algerian mobile number (05, 06 or 07 + 8 digits). quote_delivery is for an order summary: ask the customer for a corrected mobile number in one short message before you show any summary. For a price-only question, answer from delivery_fees in get_store_info instead.";

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

    case "send_product_photo":
      return await sendProductPhoto(args, ctx);

    case "get_store_info": {
      const faq = ctx.faq ? await ctx.faq.list(store.id) : [];
      const fees = ctx.fees ? await ctx.fees.list(store.id) : undefined;
      return {
        content: JSON.stringify({
          store_name: store.name,
          currency: store.currency,
          owner_notes: store.business_info ??
            "The owner hasn't written any extra store information.",
          ...(fees ? { delivery_fees: deliveryFeeSummary(fees, store.currency) } : {}),
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
      // Phone first: the summary must not be shown before the number is valid.
      const phone = typeof args.phone === "string" ? normalizeDzPhone(args.phone) : null;
      if (!phone) return { content: PHONE_FIRST, isError: true };
      if (typeof args.wilaya !== "string" || !args.wilaya.trim()) {
        return { content: "wilaya must be a non-empty string", isError: true };
      }
      const wilaya = args.wilaya.trim().slice(0, 60);
      const q = await ctx.orders.quoteDelivery(store.id, wilaya);
      if (!q.served) {
        if (q.reason === "ambiguous") {
          return {
            content: JSON.stringify({
              delivers: null,
              did_you_mean: q.suggestions ?? [],
              note: `"${wilaya}" could be more than one wilaya. Ask the customer in one short message which one they mean ("did you mean X or Y?"). Don't hand off. Call quote_delivery again with the name they confirm.`,
            }),
          };
        }
        if (q.reason === "unknown") {
          return {
            content: JSON.stringify({
              delivers: null,
              wilayas_served: q.options,
              note: `"${wilaya}" is not a wilaya name the store recognises. Ask the customer to write their wilaya again, one short message. Don't hand off.`,
            }),
          };
        }
        return {
          content: JSON.stringify({
            delivers: false,
            wilayas_served: q.options,
            note: "The store doesn't deliver to this wilaya. If the customer meant one of wilayas_served, call quote_delivery with that exact name. Otherwise tell the customer the store doesn't deliver there and offer to ask the owner (handoff_to_owner).",
          }),
        };
      }
      const notes: string[] = [];
      if (q.corrected_from) {
        notes.push(
          `The customer wrote "${q.corrected_from}"; it was read as ${q.canonical}. In the order summary write the wilaya as ${q.canonical} and ask the customer to confirm it.`,
        );
      }
      const corrected = q.corrected_from ? { corrected_from: q.corrected_from } : {};
      if (q.fee_cents === null) {
        notes.push("The owner hasn't set a delivery fee. Say the owner will confirm it, and don't invent a number.");
      }
      return {
        content: JSON.stringify({
          delivers: true,
          wilaya: q.canonical,
          delivery_fee: q.fee_cents === null ? "not set" : money(q.fee_cents, store.currency),
          ...corrected,
          ...(notes.length ? { note: notes.join(" ") } : {}),
        }),
      };
    }

    case "create_order":
      return await createOrder(args, ctx);

    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}
