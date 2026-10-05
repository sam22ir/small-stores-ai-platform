import type Anthropic from "@anthropic-ai/sdk";
import { normalizeDzPhone, orderIdempotencyKey } from "./orders.ts";
import type {
  Catalog,
  FaqPort,
  OrderLineInput,
  OrderPort,
  ProductRecord,
  StoreContext,
} from "./types.ts";

export type AgentTool = Anthropic.Beta.Messages.BetaTool;

// Exact counts are internal business data, so the model only sees a count when
// stock is low enough that "only N left" is useful to the customer.
export const LOW_STOCK_THRESHOLD = 5;

export type Availability = "in_stock" | "low_stock" | "out_of_stock";

export function availability(quantity: number): Availability {
  if (quantity <= 0) return "out_of_stock";
  return quantity <= LOW_STOCK_THRESHOLD ? "low_stock" : "in_stock";
}

export const toolDefinitions: AgentTool[] = [
  {
    name: "search_products",
    description:
      "Search this store's catalog by name or keywords. Returns matching products with price and per-variant availability. Pass an empty query to list some of the store's products.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Product name or keywords from the customer's message",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "check_stock",
    description:
      "Get current availability of every variant (size, color, etc.) of one product. Use the product_id returned by search_products.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        product_id: { type: "string", description: "product_id from search_products" },
      },
      required: ["product_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_store_info",
    description:
      "Get the owner's information about the store: hours, shipping, returns, payment, answers to questions they have already answered, and anything else they wrote down.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "handoff_to_owner",
    description:
      "Pass the conversation to the store owner and stop replying automatically. Use when the customer asks for something you can't do or answer from tool results (including buying, when order taking isn't available), complains, or asks for a human.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "One short sentence for the owner explaining what the customer needs",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
];

export const orderToolDefinitions: AgentTool[] = [
  {
    name: "quote_delivery",
    description:
      "Get the delivery fee for a wilaya (Algerian province). Call it before summarizing an order so the customer sees the total.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        wilaya: { type: "string", description: "Wilaya name as the customer wrote it, or as listed in wilayas_served" },
      },
      required: ["wilaya"],
      additionalProperties: false,
    },
  },
  {
    name: "create_order",
    description:
      "Place a cash-on-delivery order. Call it ONLY after the customer has seen the summary (items, delivery fee, total) and clearly confirmed it, and you have their real full name, phone number, wilaya and full address. Use variant_id values from search_products or check_stock.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        phone: { type: "string", description: "Customer's mobile number" },
        wilaya: { type: "string", description: "Delivery wilaya, spelled as quote_delivery returned it" },
        address: { type: "string", description: "Full delivery address (commune, street, details)" },
        items: {
          type: "array",
          description: "What to order, one entry per variant",
          items: {
            type: "object",
            properties: {
              variant_id: { type: "string", description: "variant_id from the tools" },
              quantity: { type: "integer", description: "Units, 1 to 10" },
            },
            required: ["variant_id", "quantity"],
            additionalProperties: false,
          },
        },
      },
      required: ["customer_name", "phone", "wilaya", "address", "items"],
      additionalProperties: false,
    },
  },
];

// Order tools exist only for stores whose owner turned ordering on.
export function toolsForStore(store: StoreContext): AgentTool[] {
  return store.orders_enabled
    ? [...toolDefinitions, ...orderToolDefinitions]
    : toolDefinitions;
}

// PostgREST errors are plain objects with a `message`, not Error instances.
export function errorText(err: unknown): string {
  const msg = err && typeof err === "object" && "message" in err
    ? String((err as { message: unknown }).message)
    : String(err);
  return msg.slice(0, 300);
}

export interface ToolContext {
  store: StoreContext;
  catalog: Catalog;
  orders?: OrderPort;
  faq?: FaqPort;
  conversationId?: string;
  customerId?: string;
  now?: Date;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  handoffReason?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function truncate(text: string | null, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function isSoldOut(p: ProductRecord, now: Date): boolean {
  return !!p.sold_out_until && new Date(p.sold_out_until) > now;
}

function productView(p: ProductRecord, currency: string, now: Date, withIds = false) {
  // "Sold out today" overrides the stock count without erasing it.
  const soldOut = isSoldOut(p, now);
  const variants = p.variants.map((v) => {
    const a = soldOut ? "out_of_stock" as const : availability(v.stock_quantity);
    return {
      ...(withIds ? { variant_id: v.id } : {}),
      option: v.label,
      price: v.price_cents !== null && v.price_cents !== p.price_cents
        ? money(v.price_cents, currency)
        : undefined,
      availability: a,
      units_left: a === "low_stock" ? v.stock_quantity : undefined,
    };
  });
  const anyInStock = !soldOut && p.variants.some((v) => v.stock_quantity > 0);
  return {
    product_id: p.id,
    name: p.name,
    description: truncate(p.description, 240),
    price: money(p.price_cents, currency),
    availability: anyInStock ? "available" : "out_of_stock",
    variants,
  };
}

// Answers the owner saved, newest first, capped so one chatty store can't bloat every call.
const FAQ_MAX_ENTRIES = 40;
const FAQ_MAX_CHARS = 6000;
export function formatFaq(entries: { question: string; answer: string }[]) {
  const out: { question: string; answer: string }[] = [];
  let chars = 0;
  for (const e of entries.slice(0, FAQ_MAX_ENTRIES)) {
    const item = { question: e.question.slice(0, 200), answer: e.answer.slice(0, 600) };
    chars += item.question.length + item.answer.length;
    if (chars > FAQ_MAX_CHARS) break;
    out.push(item);
  }
  return out;
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}

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
      return {
        content:
          "Conversation handed to the owner. Tell the customer, in one short sentence, that the owner will reply personally.",
        handoffReason: reason,
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

const ORDER_ERRORS: Record<string, string> = {
  wilaya_not_served:
    "The store doesn't deliver to that wilaya. Tell the customer and offer to ask the owner (handoff_to_owner).",
  unknown_variant:
    "One of the variant_id values is not valid. Call check_stock for the product and use its variant_id.",
  invalid: "The order details were rejected. Ask the customer to check them.",
};

async function createOrder(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const { store } = ctx;
  if (!store.orders_enabled || !ctx.orders || !ctx.conversationId || !ctx.customerId) {
    return { content: "Ordering is not available.", isError: true };
  }

  const name = typeof args.customer_name === "string" ? args.customer_name.trim() : "";
  const wilaya = typeof args.wilaya === "string" ? args.wilaya.trim() : "";
  const address = typeof args.address === "string" ? args.address.trim() : "";
  if (name.length < 2 || name.length > 120) {
    return { content: "customer_name is missing. Ask the customer for their full name.", isError: true };
  }
  const phone = typeof args.phone === "string" ? normalizeDzPhone(args.phone) : null;
  if (!phone) {
    return {
      content: "The phone number is not a valid Algerian mobile number (05/06/07 + 8 digits). Ask the customer to send it again.",
      isError: true,
    };
  }
  if (!wilaya || wilaya.length > 60) {
    return { content: "wilaya is missing. Ask the customer which wilaya.", isError: true };
  }
  if (address.length < 5 || address.length > 300) {
    return { content: "The address is missing or too short. Ask for the full delivery address.", isError: true };
  }

  // Merge repeated variants so one line can't smuggle past the per-line limit.
  const merged = new Map<string, number>();
  if (!Array.isArray(args.items) || args.items.length === 0 || args.items.length > 10) {
    return { content: "items must contain 1-10 entries.", isError: true };
  }
  for (const raw of args.items) {
    const it = asRecord(raw);
    if (
      typeof it.variant_id !== "string" || !UUID.test(it.variant_id) ||
      typeof it.quantity !== "number" || !Number.isInteger(it.quantity) ||
      it.quantity < 1 || it.quantity > 10
    ) {
      return {
        content: "Each item needs a variant_id from the tools and a quantity from 1 to 10.",
        isError: true,
      };
    }
    merged.set(it.variant_id, (merged.get(it.variant_id) ?? 0) + it.quantity);
  }
  const items: OrderLineInput[] = [...merged].map(([variant_id, quantity]) => ({
    variant_id,
    quantity,
  }));
  if (items.some((i) => i.quantity > 10)) {
    return { content: "At most 10 units of one item per order. Offer to ask the owner for more.", isError: true };
  }

  const result = await ctx.orders.placeOrder({
    storeId: store.id,
    conversationId: ctx.conversationId,
    customerId: ctx.customerId,
    customerName: name,
    phone,
    wilaya,
    address,
    items,
    key: orderIdempotencyKey(ctx.conversationId, phone, items, ctx.now ?? new Date()),
  });

  if (!result.ok) {
    if (result.code === "insufficient_stock") {
      return {
        content: `Not enough stock${result.detail ? ` for ${result.detail}` : ""}. Tell the customer, check availability with check_stock and suggest what is available.`,
        isError: true,
      };
    }
    return { content: ORDER_ERRORS[result.code] ?? ORDER_ERRORS.invalid, isError: true };
  }

  return {
    content: JSON.stringify({
      order_placed: true,
      already_placed_earlier: result.duplicate,
      subtotal: money(result.subtotal_cents, store.currency),
      delivery_fee: money(result.delivery_fee_cents, store.currency),
      total_to_pay_on_delivery: money(result.total_cents, store.currency),
      note: "Tell the customer the order is received, the total to pay in cash on delivery, and that the owner will contact them to confirm. Don't promise a delivery date.",
    }),
  };
}
