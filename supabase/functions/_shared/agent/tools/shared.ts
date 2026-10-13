import type { Catalog, FaqPort, OrderPort, PhotoPort, ProductPhoto, StoreContext } from "../types.ts";

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
  // SUPABASE_URL: photo links must start with its public product-images folder for this store.
  storageBase?: string;
  photos?: PhotoPort;
  // Photos queued earlier in this run. The run loop owns the array; the photo tool pushes into it
  // synchronously, so parallel calls in one round still respect the per-run limit.
  sentPhotos?: ProductPhoto[];
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  handoffReason?: string;
  handoffSummary?: string | null;
  photos?: ProductPhoto[];
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function truncate(text: string | null, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
export function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
}
