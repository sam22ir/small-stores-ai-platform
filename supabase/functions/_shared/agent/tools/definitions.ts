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
    name: "send_product_photo",
    description:
      "Send the photo of one product with your reply. Use only when the customer asks to see a product or wants photos. The photo is sent with the reply, so don't write a link to it.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        product_name: {
          type: "string",
          description: "Name of the product the customer wants to see, as search_products returned it",
        },
      },
      required: ["product_name"],
      additionalProperties: false,
    },
  },
  {
    name: "get_store_info",
    description:
      "Get the owner's information about the store: hours, shipping, returns, payment, answers to questions they have already answered, the delivery fees (delivery_fees: fee per wilaya, with one line for all other wilayas), and anything else they wrote down. For a question about the delivery price to a wilaya, answer from delivery_fees here; you don't need quote_delivery for that.",
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
        summary: {
          type: "string",
          description:
            "1-2 short sentences for the owner: what the customer wants and the key facts (product, size/variant, wilaya, quantity), in the customer's own words for the request.",
        },
      },
      required: ["reason", "summary"],
      additionalProperties: false,
    },
  },
];

export const orderToolDefinitions: AgentTool[] = [
  {
    name: "quote_delivery",
    description:
      "Order flow only: get the delivery fee for the customer's wilaya, to show in the order summary. Do not call it before the customer's phone number is known: call it only after you have a valid mobile phone number (05, 06 or 07 + 8 digits). If the phone is missing or invalid the tool returns an error; ask the customer for a valid number in one short message (not a reason to hand off). Spellings and small typos are matched. If the result says did_you_mean, ask the customer which wilaya they mean and don't hand off; if it says not served, tell the customer the store doesn't deliver there. For a price-only question, use delivery_fees from get_store_info instead.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        wilaya: { type: "string", description: "Wilaya name as the customer wrote it (spelling and typos are matched)" },
        phone: { type: "string", description: "The customer's mobile number as they wrote it (must be a valid 05/06/07 number)" },
      },
      required: ["wilaya", "phone"],
      additionalProperties: false,
    },
  },
  {
    name: "create_order",
    description:
      "Place a cash-on-delivery order. Call it ONLY in a turn after the one where you showed the summary (items, delivery fee, total), and only after the customer clearly confirmed it in their own next message, and you have their real full name, phone number, wilaya and full address. The tool refuses if the customer has not seen the total; a refusal starting with '[order not created' is not a failure: do not retry it in the same turn, show the summary and wait. Use variant_id values from search_products or check_stock.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        phone: { type: "string", description: "Customer's mobile number" },
        wilaya: { type: "string", description: "Delivery wilaya as the customer wrote it or as quote_delivery returned it; spelling is matched. If the customer's wilaya is unclear, ask first." },
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
