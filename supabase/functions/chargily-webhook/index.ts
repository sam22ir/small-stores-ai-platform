import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { applyCheckoutClosed, applyCheckoutPaid, signatureMatches } from "../_shared/billing.ts";

// Chargily Pay sends checkout events here (POST, JSON, header `signature`).
// The signature is HMAC-SHA256 hex of the raw body keyed with CHARGILY_SECRET_KEY, checked in
// constant time. Deployed with verify_jwt = false: the signature is the auth.
// checkout.paid applies the payment in one SQL call (apply_paid_checkout): a subscription extends the
// paid period by 30 days, a credit pack adds its replies. Repeats are harmless.
//
// Secrets: CHARGILY_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

const env = (k: string) => Deno.env.get(k);
const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const reply = (status: number, body: Record<string, unknown> | null = null) =>
  new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: body ? { "content-type": "application/json" } : undefined,
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  const secret = env("CHARGILY_SECRET_KEY");
  if (!secret) return reply(503, { error: "not_configured" });

  const raw = await req.text();
  if (!(await signatureMatches(raw, req.headers.get("signature"), secret))) {
    return reply(401, { error: "Invalid signature" });
  }

  let event: { type?: unknown; data?: { id?: unknown; status?: unknown } };
  try {
    event = JSON.parse(raw);
  } catch {
    return reply(400, { error: "Invalid JSON" });
  }
  const checkoutId = event.data?.id;
  if (typeof event.type !== "string" || typeof checkoutId !== "string") {
    return reply(400, { error: "Unexpected payload" });
  }

  try {
    const now = new Date();
    if (event.type === "checkout.paid") {
      const outcome = await applyCheckoutPaid(db, checkoutId);
      console.log(JSON.stringify({ event: "checkout_paid", outcome: outcome.result }));
    } else if (event.type === "checkout.failed" || event.type === "checkout.canceled") {
      await applyCheckoutClosed(db, checkoutId, event.type === "checkout.failed" ? "failed" : "canceled", now);
    }
    // Other event types are acknowledged and ignored.
    return reply(200, { received: true });
  } catch (err) {
    // Non-2xx makes Chargily retry the delivery.
    console.error("chargily-webhook failed", err instanceof Error ? err.message : "unknown");
    return reply(500, { error: "Something went wrong" });
  }
});
