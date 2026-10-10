import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { completeInstagramConnect, disconnectChannel } from "../_shared/meta/connect.ts";
import { buildAuthorizeUrl, type InstagramConfig } from "../_shared/meta/instagram.ts";
import { encryptSecret } from "../_shared/meta/crypto.ts";
import { signState } from "../_shared/meta/state.ts";

// Connects a store's Instagram professional account ("Connect Instagram" in the dashboard).
//   POST {"action":"start","store_id"}                  owner's JWT -> {"url"} to send the browser to
//   GET  ?code=&state=                                  Instagram sends the browser back here; we pass
//                                                       code and state on to the dashboard
//   POST {"action":"finish","code","state"}             owner's JWT -> {"ok", "warning"?} or {"ok": false, "reason"}
//   POST {"action":"disconnect","store_id","channel_id"} owner's JWT -> stops replies, deletes the token
// Deployed with verify_jwt = false: the GET comes from a browser redirect with no session, and the
// POSTs check the JWT themselves. The GET deliberately connects nothing: the code is only redeemed by
// "finish", signed in as the same owner who started, so an approval link can't be handed to someone
// else to pull their Instagram account into a store they don't own.
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
    // Finishing needs the owner's dashboard session, so there is nothing to finish without DASHBOARD_URL.
    return new Response(
      "Instagram could not be connected (DASHBOARD_URL is not set). Go back to your dashboard and try again.",
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  return new Response(null, { status: 302, headers: { location: `${base}/assistant?${qs}` } });
}

async function userOf(req: Request): Promise<{ userId: string } | Response> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: "Unauthorized" }, 401);
  return { userId: data.user.id };
}

async function ownerOf(req: Request, storeId: string): Promise<{ userId: string } | Response> {
  const user = await userOf(req);
  if (user instanceof Response) return user;
  const { data: member, error: memErr } = await db
    .from("store_members").select("role").eq("store_id", storeId).eq("user_id", user.userId).maybeSingle();
  if (memErr) throw memErr;
  if (!member || member.role !== "owner") return json({ error: "Forbidden" }, 403);
  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const cfg = config();

  // Instagram sends the owner's browser back here after they approve (or cancel). Hand the code to
  // the dashboard, which finishes with the owner's session.
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    if (!cfg) return backToDashboard({ instagram: "error", reason: "not_configured" });
    const code = q.get("code");
    const state = q.get("state");
    if (q.get("error") || !code || !state) return backToDashboard({ instagram: "error", reason: "denied" });
    return backToDashboard({ instagram: "finish", code, state });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  try {
    if (body.action === "finish") {
      if (!cfg) return json({ error: "not_configured" }, 503);
      if (typeof body.code !== "string" || typeof body.state !== "string") {
        return json({ error: "code and state are required" }, 400);
      }
      const user = await userOf(req);
      if (user instanceof Response) return user;
      const result = await completeInstagramConnect(
        { db, cfg, stateSecret: cfg.appSecret, encryptionKey: env("CREDENTIALS_ENCRYPTION_KEY") },
        { code: body.code, state: body.state, userId: user.userId },
      );
      return json(result.ok ? { ok: true, ...(result.warning ? { warning: result.warning } : {}) } : result);
    }

    const storeId = body.store_id;
    if (typeof storeId !== "string" || !UUID.test(storeId)) return json({ error: "store_id must be a uuid" }, 400);
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
