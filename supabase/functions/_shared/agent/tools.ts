import type Anthropic from "@anthropic-ai/sdk";
import type { Catalog, ProductRecord, StoreContext } from "./types.ts";

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
      "Get the owner's information about the store: hours, shipping, returns, payment and anything else they wrote down.",
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
      "Pass the conversation to the store owner and stop replying automatically. Use when the customer wants to buy or order, asks for something you can't answer from tool results, complains, or asks for a human.",
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

export interface ToolContext {
  store: StoreContext;
  catalog: Catalog;
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

function productView(p: ProductRecord, currency: string) {
  const variants = p.variants.map((v) => {
    const a = availability(v.stock_quantity);
    return {
      option: v.label,
      price: v.price_cents !== null && v.price_cents !== p.price_cents
        ? money(v.price_cents, currency)
        : undefined,
      availability: a,
      units_left: a === "low_stock" ? v.stock_quantity : undefined,
    };
  });
  const anyInStock = p.variants.some((v) => v.stock_quantity > 0);
  return {
    product_id: p.id,
    name: p.name,
    description: truncate(p.description, 240),
    price: money(p.price_cents, currency),
    availability: anyInStock ? "available" : "out_of_stock",
    variants,
  };
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
          results: products.map((p) => productView(p, store.currency)),
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
      return { content: JSON.stringify(productView(product, store.currency)) };
    }

    case "get_store_info":
      return {
        content: JSON.stringify({
          store_name: store.name,
          currency: store.currency,
          owner_notes: store.business_info ??
            "The owner hasn't written any extra store information.",
        }),
      };

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

    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}
