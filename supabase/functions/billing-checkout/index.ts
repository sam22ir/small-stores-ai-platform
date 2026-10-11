import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { CREDIT_PACKS, PRICE_DZD } from "../_shared/billing.ts";

// Starts a payment for a store: the monthly subscription (1,000 DA), or a reply-credit pack.
//   POST {"store_id"} with the owner's JWT -> {"checkout_url"} to send the browser to
//   POST {"store_id", "pack": "500" | "2000" | "5000"} -> a credit pack (price from CREDIT_PACKS)
// Deployed with verify_jwt = false: the function checks the JWT and the owner role itself.
//
// Secrets: CHARGILY_SECRET_KEY, CHARGILY_API_BASE (https://pay.chargily.net/test/api/v2 for test,
// https://pay.chargily.net/api/v2 for live), DASHBOARD_URL (no trailing slash), SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY. The webhook URL is <SUPABASE_URL>/functions/v1/chargily-webhook.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const env = (k: string) => Deno.env.get(k);
const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "access-control-allow-origin": "*", // bearer-token auth, no cookies
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

// Best effort: never throws, so the caller's own error is what the owner sees.
async function expireCheckout(base: string, secret: string, checkoutId: string): Promise<void> {
  try {
    const res = await fetch(`${base}/checkouts/${encodeURIComponent(checkoutId)}/expire`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
    });
    if (!res.ok) console.error("chargily checkout expire failed", res.status);
  } catch {
    console.error("chargily checkout expire failed: network");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const base = (env("CHARGILY_API_BASE") ?? "").replace(/\/+$/, "");
  const secret = env("CHARGILY_SECRET_KEY");
  const dashboard = (env("DASHBOARD_URL") ?? "").replace(/\/+$/, "");
  if (!base || !secret || !dashboard) return json({ error: "not_configured" }, 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const storeId = body.store_id;
  if (typeof storeId !== "string" || !UUID.test(storeId)) return json({ error: "store_id must be a uuid" }, 400);

  // No pack = the monthly subscription. A pack must be one of the sizes in CREDIT_PACKS.
  let pack: { credits: number; price: number } | null = null;
  if (body.pack !== undefined && body.pack !== null) {
    const key = typeof body.pack === "string" || typeof body.pack === "number" ? String(body.pack) : "";
    if (!Object.hasOwn(CREDIT_PACKS, key)) return json({ error: "pack must be one of 500, 2000, 5000" }, 400);
    pack = { credits: Number(key), price: CREDIT_PACKS[key] };
  }

  try {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { data: member, error: memErr } = await db
      .from("store_members").select("role").eq("store_id", storeId).eq("user_id", userData.user.id).maybeSingle();
    if (memErr) throw memErr;
    if (!member || member.role !== "owner") return json({ error: "Forbidden" }, 403);

    const { data: store, error: storeErr } = await db
      .from("stores").select("id,currency").eq("id", storeId).maybeSingle();
    if (storeErr) throw storeErr;
    if (!store) return json({ error: "Not found" }, 404);

    // Chargily checkout (V2). Metadata carries store_id so the webhook can be traced back, but the
    // webhook trusts the payments row written here, not the metadata.
    const res = await fetch(`${base}/checkouts`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        amount: pack ? pack.price : PRICE_DZD,
        currency: "dzd",
        payment_method: "edahabia",
        locale: "fr",
        description: pack
          ? `Store Assistant, ${pack.credits} reply credits`
          : "Store Assistant subscription, 1 month",
        success_url: `${dashboard}/settings?billing=success`,
        failure_url: `${dashboard}/settings?billing=failed`,
        webhook_endpoint: `${env("SUPABASE_URL")}/functions/v1/chargily-webhook`,
        metadata: { store_id: storeId },
      }),
    });
    if (!res.ok) {
      console.error("chargily checkout failed", res.status);
      return json({ error: "Payment provider unavailable" }, 502);
    }
    const checkout = (await res.json()) as { id?: unknown; checkout_url?: unknown };
    if (typeof checkout.id !== "string" || typeof checkout.checkout_url !== "string") {
      console.error("chargily checkout response missing id or checkout_url");
      return json({ error: "Payment provider unavailable" }, 502);
    }

    const { error: insErr } = await db.from("payments").insert(
      pack
        ? {
          store_id: storeId,
          checkout_id: checkout.id,
          amount: pack.price,
          currency: "dzd",
          status: "pending",
          kind: "credits",
          credits: pack.credits,
        }
        : {
          store_id: storeId,
          checkout_id: checkout.id,
          amount: PRICE_DZD,
          currency: "dzd",
          status: "pending",
        },
    );
    if (insErr) {
      // Chargily already created the checkout but we can't track it: expire it so it can't be paid
      // unrecorded. Best effort; the error is still returned below.
      await expireCheckout(base, secret, checkout.id);
      throw insErr;
    }

    return json({ checkout_url: checkout.checkout_url });
  } catch (err) {
    console.error("billing-checkout failed", err instanceof Error ? err.message : "unknown");
    return json({ error: "Something went wrong" }, 500);
  }
});
