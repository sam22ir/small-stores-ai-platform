import type Anthropic from "@anthropic-ai/sdk";
import type { StoreContext } from "../types.ts";

export type AgentTool = Anthropic.Beta.Messages.BetaTool;
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
              variant_id: {
                type: "string",
                description: "id of the variant exactly as search_products or check_stock returned it. Never invent one.",
              },
              quantity: { type: "integer", description: "Units, 1 to 10" },
              product_name: {
                type: "string",
                description: "Only if variant_id is missing or unsure: the product's name as search_products returned it",
              },
              variant_label: {
                type: "string",
                description: "Only with product_name: the size or option, e.g. XL, 42, Unique",
              },
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
