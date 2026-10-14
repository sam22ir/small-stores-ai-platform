export interface VariantRecord {
  id: string;
  label: string;
  price_cents: number | null; // null = use the product price
  stock_quantity: number;
}

export interface ProductRecord {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  variants: VariantRecord[];
  aliases?: string | null; // other names customers use, comma separated
  sold_out_until?: string | null; // ISO time; the product counts as out of stock until then
  image_url?: string | null; // public product photo (see 0029_product_images.sql); never shown to the model
}

// Every method takes the store id explicitly. It always comes from the resolved
// channel, never from model output, so one tenant can't read another's catalog.
export interface Catalog {
  searchProducts(
    storeId: string,
    query: string,
    limit: number,
  ): Promise<ProductRecord[]>;
  getProduct(storeId: string, productId: string): Promise<ProductRecord | null>;
}

export interface StoreContext {
  id: string;
  name: string;
  currency: string;
  business_info: string | null;
  orders_enabled?: boolean; // the owner switched on order taking
  reply_tone?: ReplyTone; // see prompt.ts; missing = friendly
  reply_emoji?: boolean; // missing = false
}

export type ReplyTone = "friendly" | "formal";

export interface OrderLineInput {
  variant_id: string;
  quantity: number;
}

export interface PlaceOrderInput {
  storeId: string;
  conversationId: string;
  customerId: string;
  customerName: string;
  phone: string; // normalized 0XXXXXXXXX
  wilaya: string;
  address: string;
  items: OrderLineInput[];
  key: string; // idempotency key: a retried tool call must not create a second order
}

export type PlaceOrderResult =
  | {
    ok: true;
    order_id: string;
    subtotal_cents: number;
    delivery_fee_cents: number;
    total_cents: number;
    duplicate: boolean;
  }
  | { ok: false; code: "wilaya_not_served" | "unknown_variant" | "insufficient_stock" | "invalid"; detail?: string };

export interface DeliveryQuote {
  // false when the store has a fee table and this wilaya isn't in it.
  served: boolean;
  // null when the owner hasn't set any delivery fees.
  fee_cents: number | null;
  // The wilaya spelled as the owner stored it; create_order must use this spelling.
  canonical?: string;
  // When not served: what the store does deliver to, so the model can map "Algiers" to "Alger".
  options?: string[];
  // Why served is false: a typo with several candidates (ask "did you mean ...?"), a name that is
  // no wilaya at all (ask the customer to check it), or a real wilaya the store doesn't serve.
  reason?: "ambiguous" | "unknown" | "not_served";
  // With reason "ambiguous": the store's spellings of the candidate wilayas.
  suggestions?: string[];
  // Set when the customer's spelling was corrected to canonical (a unique typo match).
  corrected_from?: string;
}

// The owner's delivery fees, one row per wilaya the store delivers to (delivery_fees table).
export interface DeliveryFeesPort {
  list(storeId: string): Promise<{ wilaya: string; fee_cents: number }[]>;
}

// Orders are written by the server only; prices and stock are re-checked in the database.
export interface OrderPort {
  quoteDelivery(storeId: string, wilaya: string): Promise<DeliveryQuote>;
  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  // Subtotal in cents of the basket at today's prices (variant price, else product price, as place_order
  // charges it). null when a variant id is unknown. Used only by the create_order confirmation guard.
  priceBasket(storeId: string, items: OrderLineInput[]): Promise<number | null>;
}

// Product photos the agent queued for the customer in one run. The URL must be in this store's folder
// of the product-images bucket (see tools/photo.ts).
export interface ProductPhoto {
  url: string;
  name: string; // product name, used as the caption
}

// Which photos were already sent in a conversation (outbound message attachments).
export interface PhotoPort {
  sentUrls(conversationId: string): Promise<string[]>;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

// Answers the owner saved for questions the assistant couldn't handle on its own.
export interface FaqPort {
  list(storeId: string): Promise<FaqEntry[]>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  // Photos the customer sent, as data URLs (see meta/media.ts). Only set on the last customer turn.
  images?: { dataUrl: string }[];
}

export interface ToolCallLog {
  name: string;
  input: unknown;
  is_error: boolean;
  error?: string; // why it failed, so agent_runs is enough to debug
  output?: string; // compact facts from a successful lookup, reused on later turns
}

export interface AgentResult {
  reply: string;
  handoffReason: string | null;
  handoffSummary: string | null; // the owner summary from handoff_to_owner, set together with handoffReason
  toolCalls: ToolCallLog[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
  photos?: ProductPhoto[]; // only set when a photo was queued; sent after the text reply
}
