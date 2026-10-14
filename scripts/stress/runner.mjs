// Runs scripted customer conversations through the real inbound pipeline (handleInbound) against
// the in-memory database from state.mjs / fakedb.mjs. One case = one fresh database.
import { AsyncLocalStorage } from "node:async_hooks";
import { handleInbound } from "../../supabase/functions/_shared/pipeline.ts";
import { providerFromEnv } from "../../supabase/functions/_shared/agent/providers.ts";
import { createFakeDb } from "./fakedb.mjs";
import { buildState, SUPABASE_URL, uuidFor } from "./state.mjs";
import { stubCompletion } from "./stub-model.mjs";

export const MAX_ATTEMPTS = 4; // whole-case attempts for infrastructure failures
const CONFIG_STATUS = new Set([401, 403, 404]); // wrong key, no permission, wrong model name
let hinted = false; // the --probe hint is printed once per run
const STUB_ORIGIN = "https://stub.invalid";
const STUB_BASE = `${STUB_ORIGIN}/v1`;

// The only environment the pipeline can see. Production reads these from the function secrets.
// LLM_FALLBACK_* is deliberately absent: the stress run has no fallback provider.
const LLM_KEYS = [
  "LLM_PROVIDER",
  "LLM_BASE_URL",
  "LLM_API_KEY",
  "LLM_MODEL",
  "LLM_TOKEN_PARAM",
  "LLM_REASONING_EFFORT",
  "LLM_TEMPERATURE",
  "LLM_VISION",
];

// Returns the env accessor for handleInbound. Values are never printed.
export function makeEnv(mode, processEnv = process.env) {
  const values = {
    SUPABASE_URL,
  };
  if (mode === "stub") {
    Object.assign(values, {
      LLM_PROVIDER: "openai-compatible",
      LLM_BASE_URL: STUB_BASE,
      LLM_API_KEY: "stub-key",
      LLM_MODEL: "stub-model",
      LLM_TOKEN_PARAM: "max_tokens",
    });
  } else {
    for (const k of LLM_KEYS) if (processEnv[k] !== undefined) values[k] = processEnv[k];
  }
  const allowed = new Set([...LLM_KEYS, "SUPABASE_URL"]);
  return { env: (key) => (allowed.has(key) ? values[key] : undefined), values };
}

// Names of what is missing; never values.
export function missingLlmSettings(env) {
  const need = ["LLM_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"];
  const missing = need.filter((k) => !env(k));
  if (env("LLM_PROVIDER") && env("LLM_PROVIDER") !== "openai-compatible") missing.push("LLM_PROVIDER=openai-compatible");
  if (!missing.length && !providerFromEnv(env, "LLM_")) missing.push("LLM provider");
  return missing;
}

// --- Fetch guard -------------------------------------------------------------
// Only the model endpoint may be reached. In --stub mode the model is answered locally.
// Per-case state travels with AsyncLocalStorage, because cases run concurrently.
const als = new AsyncLocalStorage();

// Owner alerts and EdgeRuntime.waitUntil: the promise is kept on the case so the runner can await it.
globalThis.EdgeRuntime = {
  waitUntil(p) {
    const store = als.getStore();
    const settled = Promise.resolve(p).catch(() => {});
    if (store) store.pending.push(settled);
  },
};

const isTimeout = (e) => e?.name === "TimeoutError" || e?.name === "AbortError";

export function installFetchGuard({ mode, fixture, llmBaseUrl }) {
  const realFetch = globalThis.fetch;
  const llmOrigin = mode === "stub" ? STUB_ORIGIN : new URL(llmBaseUrl).origin;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== llmOrigin) {
      throw new Error("blocked: the stress runner may only call the model endpoint");
    }
    const ctx = als.getStore();
    if (mode === "stub") {
      const body = JSON.parse(String(init.body ?? "{}"));
      const out = stubCompletion(body, fixture);
      return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
    }
    let res;
    try {
      res = await realFetch(input, init);
    } catch (err) {
      if (ctx) ctx.infra = { kind: isTimeout(err) ? "timeout" : "network", retryAfter: null };
      throw err;
    }
    if (ctx && !res.ok) {
      ctx.llmStatus = res.status;
      if (res.status === 429 || res.status >= 500) {
        ctx.infra = {
          kind: res.status === 429 ? "http 429" : `http ${res.status}`,
          retryAfter: res.headers.get("retry-after"),
        };
      }
    }
    return res;
  };
}

// One tiny model call. Prints nothing itself: returns the status code, or null on a network error.
export async function probe(env) {
  const base = env("LLM_BASE_URL").replace(/\/+$/, "");
  const tokenParam = env("LLM_TOKEN_PARAM") === "max_completion_tokens" ? "max_completion_tokens" : "max_tokens";
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env("LLM_API_KEY")}` },
      body: JSON.stringify({
        model: env("LLM_MODEL"),
        messages: [{ role: "user", content: "say ok" }],
        [tokenParam]: 16,
        ...(env("LLM_REASONING_EFFORT") ? { reasoning_effort: env("LLM_REASONING_EFFORT") } : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    await res.body?.cancel();
    return res.status;
  } catch {
    return null;
  }
}

// --- One case ------------------------------------------------------------------

const settle = async (ctx) => {
  while (ctx.pending.length) await Promise.allSettled(ctx.pending.splice(0));
};

function backoffMs(attempt, retryAfter) {
  const base = 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(base, Math.min(60_000, seconds * 1000)) : base;
}

function ordersOf(tables) {
  return (tables.orders ?? []).map((o) => ({
    id: o.id,
    customer_name: o.customer_name,
    phone: o.phone,
    wilaya: o.wilaya,
    address: o.address,
    subtotal_cents: o.subtotal_cents,
    delivery_fee_cents: o.delivery_fee_cents,
    total_cents: o.total_cents,
    items: (tables.order_items ?? []).filter((i) => i.order_id === o.id).map((i) => ({
      product: i.name,
      variant: i.variant_label,
      quantity: i.quantity,
      unit_price_cents: i.unit_price_cents,
    })),
  }));
}

// Runs every turn once. Returns {turns, infra, state} where infra is set when a turn failed
// because the model endpoint was unavailable (the whole case is then retried from scratch).
async function attemptCase(def, cfg) {
  const state = buildState(cfg.fixture, def.id);
  const db = createFakeDb(state.tables, { seed: `${def.id}:${cfg.attempt}` });
  const { storeId, channelId, customerId, conversationId } = state.ids;
  const ctx = { pending: [], infra: null, llmStatus: null };
  const turns = [];

  return als.run(ctx, async () => {
    for (let i = 0; i < def.turns.length; i++) {
      ctx.infra = null;
      ctx.llmStatus = null;
      const text = def.turns[i];
      const inboundId = uuidFor(`${def.id}:${cfg.attempt}:inbound:${i}`);
      await db.from("messages").insert({
        id: inboundId,
        store_id: storeId,
        conversation_id: conversationId,
        channel_id: channelId,
        direction: "inbound",
        sender: "customer",
        body: text,
      });
      const { data: before } = await db.from("conversations").select("id,status").eq("id", conversationId)
        .maybeSingle();

      const alerts = [];
      let result = null;
      let thrown = null;
      try {
        result = await handleInbound({
          db,
          env: cfg.env,
          store: { ...state.store },
          channelId,
          conversation: { id: conversationId, status: before.status },
          customerId,
          inboundMessageId: inboundId,
          text,
          source: "customer",
          debounceMs: 1500, // the webhook's debounce path runs; sleep is a no-op because turns are sequential
          sleep: async () => {},
          notify: async (_storeId, message) => {
            alerts.push(message);
          },
        });
      } catch (err) {
        thrown = err;
      }
      await settle(ctx);

      // Infrastructure: 429, 5xx, timeouts and network errors are retried. A rejected key, permission or
      // model name (401, 403, 404) is a configuration fault: recorded at once, never retried. Other 4xx
      // are the request's fault, not the infrastructure's, so they stay on the turn as error llm_http_<status>.
      const failedOnModel = (result && result.ok && result.degraded) || thrown;
      if (failedOnModel && (ctx.infra || CONFIG_STATUS.has(ctx.llmStatus))) {
        const infra = ctx.infra ?? { kind: `http ${ctx.llmStatus}`, retryAfter: null, retryable: false };
        if (!infra.retryable && !hinted) {
          hinted = true;
          process.stderr.write(`stress: the model rejected the request (HTTP ${ctx.llmStatus}); check the settings with --probe\n`);
        }
        return { turns, infra: { turn: i + 1, retryable: true, ...infra }, state };
      }

      const { data: after } = await db.from("conversations").select("status,handoff_summary").eq("id", conversationId)
        .maybeSingle();
      const ok = result && result.ok;
      let error = null;
      if (thrown) error = `exception: ${thrown.name ?? "Error"}`;
      else if (result && !result.ok) error = result.error;
      else if (result?.degraded) error = ctx.llmStatus ? `llm_http_${ctx.llmStatus}` : "degraded_reply";

      turns.push({
        customer: text,
        reply: ok ? result.reply : null,
        status: ok ? result.status : after.status,
        tools: ok ? result.tool_calls : [],
        handoff_reason: ok ? result.handoff : null,
        handoff_summary: ok && result.handoff ? after.handoff_summary ?? null : null,
        alerts,
        error,
        usage: ok ? result.usage : { input_tokens: 0, output_tokens: 0 },
        photos: ok && result.photos ? result.photos.map((p) => p.name) : [],
      });
    }
    return { turns, infra: null, state };
  });
}

// Runs one case with infrastructure retries. Returns the output record (see SPEC "Result record").
export async function runCase(def, cfg) {
  for (let attempt = 1;; attempt++) {
    const res = await attemptCase(def, { ...cfg, attempt });
    const orders = ordersOf(res.state.tables);
    const base = {
      id: def.id,
      category: def.category,
      turns: res.turns,
      order_created: orders.length > 0,
      orders,
    };
    if (!res.infra) return { ...base, infra_error: null, attempt };
    if (attempt >= MAX_ATTEMPTS || !res.infra.retryable) {
      const infra_error = `${res.infra.kind} at turn ${res.infra.turn} after ${attempt} attempts`;
      return { ...base, infra_error, attempt };
    }
    await new Promise((r) => setTimeout(r, backoffMs(attempt, res.infra.retryAfter)));
  }
}
