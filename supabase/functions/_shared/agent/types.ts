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
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ToolCallLog {
  name: string;
  input: unknown;
  is_error: boolean;
  error?: string; // why it failed, so agent_runs is enough to debug
}

export interface AgentResult {
  reply: string;
  handoffReason: string | null;
  toolCalls: ToolCallLog[];
  usage: { input_tokens: number; output_tokens: number };
  model: string;
}
