// Yalidine Express REST client, fee quotes only (parcels and tracking come later).
//
// Confirmed from the community SDK (npm "yalidine", feeefapp/yalidine): base https://api.yalidine.app/v1,
// headers X-API-ID and X-API-TOKEN, list responses { has_more, total_data, data[] } paged with page and
// page_size, quota headers and retry-after on 429, and the DeliveryFees shape: from_wilaya_name,
// to_wilaya_name, zone, per_commune { <id>: { express_home, express_desk, economic_home, economic_desk } }.
// Note that shape names the destination wilaya but carries no wilaya id, so it is resolved from the name.
// NOT confirmed (the SDK's published build has no fees implementation, Yalidine's own docs need a merchant
// login): the fees path ("deliveryfees" or "fees") and whether from_wilaya_id filters the list. The code
// tries both paths and checks the origin itself. Verify against a real account before relying on it.

import { normalizeWilaya } from "../agent/wilaya.ts";

export type FeeType = "home" | "desk";

export const YALIDINE_BASE = "https://api.yalidine.app/v1";
// A failed lookup falls back to the next path only on 404; any other error is real.
const FEES_PATHS = ["deliveryfees", "fees"];

export class YalidineError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.name = "YalidineError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export interface YalidineCredentials {
  id: string;
  token: string;
}

export interface YalidineOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Page<T> = { has_more?: boolean; data?: T[] };

export class YalidineClient {
  private creds: YalidineCredentials;
  private base: string;
  private doFetch: typeof fetch;
  private timeoutMs: number;

  constructor(creds: YalidineCredentials, opts: YalidineOptions = {}) {
    this.creds = creds;
    this.base = (opts.baseUrl ?? YALIDINE_BASE).replace(/\/+$/, "");
    this.doFetch = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 15000;
  }

  async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${this.base}/${path.replace(/^\/+/, "")}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const res = await this.doFetch(url, {
      headers: { "X-API-ID": this.creds.id, "X-API-TOKEN": this.creds.token, accept: "application/json" },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after"));
      throw new YalidineError(429, "rate_limited", Number.isFinite(wait) && wait > 0 ? wait : 60);
    }
    if (res.status === 401 || res.status === 403) throw new YalidineError(res.status, "bad_credentials");
    if (!res.ok) throw new YalidineError(res.status, `yalidine_http_${res.status}`);
    return (await res.json()) as T;
  }

  // Cheap call that proves the ID and token work.
  async testConnection(): Promise<void> {
    await this.get("wilayas", { page_size: 1 });
  }

  // Every item of a paged list, following has_more. maxPages guards against a server that never stops.
  async list<T>(path: string, params: Record<string, string | number> = {}, maxPages = 20): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const body = await this.get<Page<T>>(path, { ...params, page, page_size: 100 });
      out.push(...(body.data ?? []));
      if (!body.has_more) break;
    }
    return out;
  }

  // Fees from one origin wilaya to every destination wilaya, as one wilaya-level price in DA each.
  async wilayaFees(fromWilayaId: number, type: FeeType): Promise<Map<number, number>> {
    let items: unknown[] | null = null;
    let lastErr: unknown;
    for (const path of FEES_PATHS) {
      try {
        items = await this.list<unknown>(path, { from_wilaya_id: fromWilayaId });
        break;
      } catch (err) {
        lastErr = err;
        if (!(err instanceof YalidineError && err.status === 404)) throw err;
      }
    }
    if (!items) throw lastErr;
    const out = new Map<number, number>();
    for (const item of items) {
      const fee = parseWilayaFee(item, type, fromWilayaId);
      if (fee) out.set(fee.toWilayaId, fee.feeDa);
    }
    return out;
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

// Field names tried in order for the price of the chosen delivery type. Express is the standard service.
const KEYS: Record<FeeType, string[]> = {
  home: ["express_home", "home_fee", "home", "economic_home"],
  desk: ["express_desk", "desk_fee", "stopdesk", "desk", "economic_desk"],
};

function priceOf(obj: Record<string, unknown>, type: FeeType): number | null {
  for (const k of KEYS[type]) {
    const n = num(obj[k]);
    // 0 means "not offered", never "free": a wrong free quote costs the owner money.
    if (n !== null && n > 0) return n;
  }
  return null;
}

// One wilaya-level price. Fees can differ by commune, so take the most common price among the communes
// (the lowest when tied): that is what a typical customer in the wilaya pays. Quotes are an estimate;
// the carrier's real price is applied when the parcel is created.
// The destination is read from an id when the item has one, otherwise from its name (the documented shape
// has only to_wilaya_name). When fromWilayaId is given, an item that names a different origin is skipped,
// in case the server ignores the from_wilaya_id filter and returns every origin.
export function parseWilayaFee(
  item: unknown,
  type: FeeType,
  fromWilayaId?: number,
): { toWilayaId: number; feeDa: number } | null {
  const o = rec(item);
  if (!o) return null;
  if (fromWilayaId !== undefined && typeof o.from_wilaya_name === "string") {
    const from = normalizeWilaya(o.from_wilaya_name);
    if (from !== null && Number(from) !== fromWilayaId) return null;
  }
  let toWilayaId = num(o.to_wilaya_id ?? o.wilaya_id);
  if (toWilayaId === null && typeof o.to_wilaya_name === "string") {
    const code = normalizeWilaya(o.to_wilaya_name);
    toWilayaId = code === null ? null : Number(code);
  }
  if (toWilayaId === null || !Number.isInteger(toWilayaId)) return null;

  const communes = Array.isArray(o.per_commune) ? o.per_commune : rec(o.per_commune) ? Object.values(o.per_commune as object) : [];
  const prices: number[] = [];
  for (const c of communes) {
    const co = rec(c);
    const p = co ? priceOf(co, type) : null;
    if (p !== null) prices.push(p);
  }
  if (prices.length === 0) {
    const flat = priceOf(o, type);
    if (flat === null) return null;
    return { toWilayaId, feeDa: flat };
  }
  const counts = new Map<number, number>();
  for (const p of prices) counts.set(p, (counts.get(p) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  return { toWilayaId, feeDa: best };
}
