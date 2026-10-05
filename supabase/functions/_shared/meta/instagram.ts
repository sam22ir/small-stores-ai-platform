// Thin client for "Instagram API with Instagram Login" (graph.instagram.com).
// Endpoints per Meta's docs: Business Login (authorize -> code -> short token -> 60-day token ->
// refresh), User profile, webhook subscription and the Send API. Nothing here touches the database.

export const DEFAULT_GRAPH_VERSION = "v25.0";
// Least privilege: read the account and send/receive DMs. Comments and publishing are not used.
export const SCOPES = ["instagram_business_basic", "instagram_business_manage_messages"];
// Instagram rejects a text message above 1000 bytes; stay a little under.
export const MAX_TEXT_BYTES = 950;

export interface InstagramConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  graphVersion?: string;
}

export class MetaApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  constructor(message: string, status: number, code: number | null = null) {
    super(message);
    this.name = "MetaApiError";
    this.status = status;
    this.code = code;
  }
  // The token is expired or revoked: the owner has to connect again.
  get tokenInvalid() {
    return this.code === 190;
  }
  // The customer's 24-hour window is closed.
  get windowClosed() {
    return this.code === 1545041 || (this.code === 10 && /window/i.test(this.message));
  }
}

const graph = (v?: string) => `https://graph.instagram.com/${v ?? DEFAULT_GRAPH_VERSION}`;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

// Graph errors look like {error:{message,code}}; the OAuth host uses {error_message,code}.
async function call(res: Response): Promise<Record<string, unknown>> {
  const body = await readJson(res);
  if (res.ok && !body.error && !body.error_message) return body;
  const err = (body.error ?? {}) as { message?: string; code?: number };
  const message = err.message ?? (body.error_message as string | undefined) ?? `HTTP ${res.status}`;
  const code = typeof err.code === "number" ? err.code : typeof body.code === "number" ? body.code : null;
  throw new MetaApiError(String(message).slice(0, 300), res.status, code);
}

export function buildAuthorizeUrl(cfg: InstagramConfig, state: string): string {
  const q = new URLSearchParams({
    client_id: cfg.appId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPES.join(","),
    state,
    force_reauth: "true", // owners may be signed in to a personal account; make them pick the shop's
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

export async function exchangeCode(cfg: InstagramConfig, code: string): Promise<{ accessToken: string; userId: string }> {
  const form = new FormData();
  form.set("client_id", cfg.appId);
  form.set("client_secret", cfg.appSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", cfg.redirectUri);
  form.set("code", code);
  const body = await call(await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form }));
  // Documented as {data:[{...}]}; older responses were flat.
  const row = ((body.data as Record<string, unknown>[] | undefined)?.[0] ?? body) as Record<string, unknown>;
  if (typeof row.access_token !== "string") throw new MetaApiError("No access token in response", 200);
  return { accessToken: row.access_token, userId: String(row.user_id ?? "") };
}

export interface LongLivedToken {
  accessToken: string;
  expiresAt: Date;
}

function tokenFrom(body: Record<string, unknown>, now: Date): LongLivedToken {
  if (typeof body.access_token !== "string") throw new MetaApiError("No access token in response", 200);
  const seconds = typeof body.expires_in === "number" ? body.expires_in : 60 * 24 * 3600;
  return { accessToken: body.access_token, expiresAt: new Date(now.getTime() + seconds * 1000) };
}

// Server side only: the request carries the app secret.
export async function toLongLived(cfg: InstagramConfig, shortToken: string, now = new Date()): Promise<LongLivedToken> {
  const q = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: cfg.appSecret,
    access_token: shortToken,
  });
  return tokenFrom(await call(await fetch(`https://graph.instagram.com/access_token?${q}`)), now);
}

// A long-lived token can be refreshed once it is 24 hours old and not yet expired.
export async function refreshLongLived(token: string, now = new Date()): Promise<LongLivedToken> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  return tokenFrom(await call(await fetch(`https://graph.instagram.com/refresh_access_token?${q}`)), now);
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export interface Profile {
  accountId: string; // the professional account id used in webhooks (entry.id)
  username: string | null;
  name: string | null;
}

export async function getProfile(token: string, version?: string): Promise<Profile> {
  const body = await call(
    await fetch(`${graph(version)}/me?fields=user_id,username,name`, { headers: bearer(token) }),
  );
  const accountId = String(body.user_id ?? body.id ?? "");
  if (!accountId) throw new MetaApiError("Profile has no account id", 200);
  return {
    accountId,
    username: typeof body.username === "string" ? body.username : null,
    name: typeof body.name === "string" ? body.name : null,
  };
}

// A customer's display name from their Instagram-scoped id. Best effort; callers ignore failures.
export async function getUserName(token: string, igsid: string, version?: string): Promise<string | null> {
  const body = await call(
    await fetch(`${graph(version)}/${encodeURIComponent(igsid)}?fields=name,username`, { headers: bearer(token) }),
  );
  const name = typeof body.name === "string" && body.name ? body.name : null;
  const username = typeof body.username === "string" && body.username ? `@${body.username}` : null;
  return name ?? username;
}

// Turns on delivery of customers' messages to our webhook for this account.
export async function subscribeToMessages(token: string, version?: string): Promise<void> {
  await call(
    await fetch(`${graph(version)}/me/subscribed_apps?subscribed_fields=messages`, {
      method: "POST",
      headers: bearer(token),
    }),
  );
}

export async function sendText(
  token: string,
  recipientId: string,
  text: string,
  version?: string,
): Promise<{ messageId: string | null }> {
  const body = await call(
    await fetch(`${graph(version)}/me/messages`, {
      method: "POST",
      headers: { ...bearer(token), "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
    }),
  );
  return { messageId: typeof body.message_id === "string" ? body.message_id : typeof body.id === "string" ? body.id : null };
}

// Splits a long reply into messages that fit Instagram's limit, preferring paragraph, line,
// sentence and word boundaries. Counts UTF-8 bytes, because Arabic uses two per letter.
export function splitForInstagram(text: string, maxBytes = MAX_TEXT_BYTES): string[] {
  const enc = new TextEncoder();
  const bytes = (s: string) => enc.encode(s).length;
  const clean = text.trim();
  if (!clean) return [];
  if (bytes(clean) <= maxBytes) return [clean];

  const parts: string[] = [];
  let rest = clean;
  while (bytes(rest) > maxBytes) {
    // Largest prefix (in characters) that fits.
    let lo = 1, hi = rest.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (bytes(rest.slice(0, mid)) <= maxBytes) lo = mid; else hi = mid - 1;
    }
    const head = rest.slice(0, lo);
    // Break at the last natural boundary in the second half of the chunk, else hard cut.
    let cut = -1;
    for (const re of [/\n\n/g, /\n/g, /[.!?؟。]\s/g, /\s/g]) {
      let m: RegExpExecArray | null;
      let last = -1;
      while ((m = re.exec(head)) !== null) last = m.index + m[0].length;
      if (last > head.length / 2) {
        cut = last;
        break;
      }
    }
    if (cut === -1) cut = lo;
    // Never split a surrogate pair.
    const code = rest.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}
