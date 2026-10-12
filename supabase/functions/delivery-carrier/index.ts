import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { encryptSecret } from "../_shared/meta/crypto.ts";
import { syncYalidineFees } from "../_shared/carriers/sync.ts";
import { YalidineClient, YalidineError } from "../_shared/carriers/yalidine.ts";

// Connects a store to its Yalidine account and keeps the store's delivery fees in step with Yalidine's prices.
// Every action needs the store owner's JWT:
//   POST {"action":"connect","store_id","api_id","api_token","from_wilaya_id","fee_type"?}
//        checks the credentials, saves them encrypted, then syncs -> {"ok", "added", "updated", "skipped"}
//   POST {"action":"sync","store_id","overwrite"?}   pulls the prices again; overwrite replaces fees typed by hand
//   POST {"action":"disconnect","store_id"}          forgets the credentials (fees already copied stay)
// Failures answer {"ok": false, "reason"}. Deployed with verify_jwt = false: the JWT is checked here.
// Secret: CREDENTIALS_ENCRYPTION_KEY (shared with the Instagram connection).

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

async function ownerOf(req: Request, storeId: string): Promise<{ userId: string } | Response> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: "Unauthorized" }, 401);
  const { data: member, error: memErr } = await db
    .from("store_members").select("role").eq("store_id", storeId).eq("user_id", data.user.id).maybeSingle();
  if (memErr) throw memErr;
  if (!member || member.role !== "owner") return json({ error: "Forbidden" }, 403);
  return { userId: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const storeId = body.store_id;
  if (typeof storeId !== "string" || !UUID.test(storeId)) return json({ error: "store_id must be a uuid" }, 400);

  try {
    const owner = await ownerOf(req, storeId);
    if (owner instanceof Response) return owner;
    const key = env("CREDENTIALS_ENCRYPTION_KEY");

    if (body.action === "connect") {
      const { api_id: id, api_token: token, from_wilaya_id: from } = body;
      const feeType = body.fee_type ?? "home";
      if (typeof id !== "string" || typeof token !== "string" || !id.trim() || !token.trim() || id.length > 200 || token.length > 400) {
        return json({ error: "api_id and api_token are required" }, 400);
      }
      if (typeof from !== "number" || !Number.isInteger(from) || from < 1 || from > 69) return json({ error: "from_wilaya_id must be 1..69" }, 400);
      if (feeType !== "home" && feeType !== "desk") return json({ error: "fee_type must be home or desk" }, 400);
      try {
        await encryptSecret("probe", key);
      } catch (err) {
        console.error("CREDENTIALS_ENCRYPTION_KEY is not usable (needs 32 random bytes, base64)", err instanceof Error ? err.message : err);
        return json({ error: "not_configured" }, 503);
      }
      try {
        await new YalidineClient({ id: id.trim(), token: token.trim() }).testConnection();
      } catch (err) {
        if (err instanceof YalidineError) {
          return json({ ok: false, reason: err.status === 401 || err.status === 403 ? "bad_credentials" : err.status === 429 ? "rate_limited" : "failed" });
        }
        throw err;
      }
      const { error } = await db.from("store_carriers").upsert({
        store_id: storeId,
        carrier: "yalidine",
        api_id_encrypted: await encryptSecret(id.trim(), key),
        api_token_encrypted: await encryptSecret(token.trim(), key),
        from_wilaya_id: from,
        fee_type: feeType,
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,carrier" });
      if (error) throw error;
      return json(await syncYalidineFees(db, storeId, { encryptionKey: key }));
    }

    if (body.action === "sync") {
      return json(await syncYalidineFees(db, storeId, { encryptionKey: key, overwrite: body.overwrite === true }));
    }

    if (body.action === "disconnect") {
      const { error } = await db.from("store_carriers").delete().eq("store_id", storeId).eq("carrier", "yalidine");
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("delivery-carrier failed", err);
    return json({ error: "Something went wrong" }, 500);
  }
});
