import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { completeInstagramConnect, disconnectChannel } from "../_shared/meta/connect.ts";
import { buildAuthorizeUrl, type InstagramConfig } from "../_shared/meta/instagram.ts";
import { encryptSecret } from "../_shared/meta/crypto.ts";
import { signState } from "../_shared/meta/state.ts";

// Connects a store's Instagram professional account ("Connect Instagram" in the dashboard).
//   POST {"action":"start","store_id"}                  owner's JWT -> {"url"} to send the browser to
//   POST {"action":"disconnect","store_id","channel_id"} owner's JWT -> stops replies, deletes the token
//   GET  ?code=&state=                                  Instagram sends the browser back here
// Deployed with verify_jwt = false: the GET comes from a browser redirect with no session (it is
// protected by the signed state), and the POSTs check the JWT themselves.
//
// Secrets: INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET, CREDENTIALS_ENCRYPTION_KEY, DASHBOARD_URL
// (https://your-dashboard.example, no trailing slash). The redirect URL to register in the Meta
// dashboard is  <SUPABASE_URL>/functions/v1/instagram-connect

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const env = (k: string) => Deno.env.get(k);
const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "access-control-allow-origin": "*", // bearer-token auth, no cookies
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

function config(): InstagramConfig | null {
  const appId = env("INSTAGRAM_APP_ID");
  const appSecret = env("INSTAGRAM_APP_SECRET");
  const base = env("SUPABASE_URL");
  if (!appId || !appSecret || !base || !env("CREDENTIALS_ENCRYPTION_KEY")) return null;
  return {
    appId,
    appSecret,
    redirectUri: `${base}/functions/v1/instagram-connect`,
    graphVersion: env("META_GRAPH_API_VERSION"),
  };
}

const dashboardUrl = () => (env("DASHBOARD_URL") ?? "").replace(/\/+$/, "");

function backToDashboard(query: Record<string, string>): Response {
  const base = dashboardUrl();
  const qs = new URLSearchParams(query).toString();
  if (!base) {
    return new Response(
      query.instagram === "connected"
        ? "Instagram connected. You can close this tab and go back to your dashboard."
        : `Instagram could not be connected (${query.reason ?? "error"}). Go back to your dashboard and try again.`,
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(null, { status: 302, headers: { location: `${base}/assistant?${qs}` } });
}

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
  const cfg = config();

  // Instagram sends the owner's browser back here after they approve (or cancel).
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    if (!cfg) return backToDashboard({ instagram: "error", reason: "not_configured" });
    try {
      const result = await completeInstagramConnect(
        { db, cfg, stateSecret: cfg.appSecret, encryptionKey: env("CREDENTIALS_ENCRYPTION_KEY") },
        { code: q.get("code"), state: q.get("state"), error: q.get("error") },
      );
      return result.ok
        ? backToDashboard({ instagram: "connected", ...(result.warning ? { warning: result.warning } : {}) })
        : backToDashboard({ instagram: "error", reason: result.reason });
    } catch (err) {
      console.error("instagram-connect callback failed", err);
      return backToDashboard({ instagram: "error", reason: "server_error" });
    }
  }

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

    if (body.action === "start") {
      if (!cfg) return json({ error: "not_configured" }, 503);
      // Don't send the owner through Instagram's login only to fail afterwards: make sure the
      // encryption key can actually be used.
      try {
        await encryptSecret("probe", env("CREDENTIALS_ENCRYPTION_KEY"));
      } catch (err) {
        console.error("CREDENTIALS_ENCRYPTION_KEY is not usable (needs 32 random bytes, base64)", err instanceof Error ? err.message : err);
        return json({ error: "not_configured" }, 503);
      }
      const state = await signState({ store_id: storeId, user_id: owner.userId }, cfg.appSecret);
      return json({ url: buildAuthorizeUrl(cfg, state) });
    }

    if (body.action === "disconnect") {
      const channelId = body.channel_id;
      if (typeof channelId !== "string" || !UUID.test(channelId)) return json({ error: "channel_id must be a uuid" }, 400);
      return (await disconnectChannel(db, storeId, channelId)) ? json({ ok: true }) : json({ error: "Not found" }, 404);
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("instagram-connect failed", err);
    return json({ error: "Something went wrong" }, 500);
  }
});
