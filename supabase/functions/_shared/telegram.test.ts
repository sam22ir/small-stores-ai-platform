import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  handleTelegramUpdate,
  notifyOwner,
  parseStartCode,
  sendTelegram,
  webhookSecretOk,
} from "./telegram.ts";

const CODE = "0123456789abcdef0123456789abcdef";

test("parses /start with a code, including the @bot form, and rejects everything else", () => {
  assert.equal(parseStartCode(`/start ${CODE}`), CODE);
  assert.equal(parseStartCode(`/start@MyStoreBot ${CODE}  `), CODE);
  assert.equal(parseStartCode("/start"), null);
  assert.equal(parseStartCode("/start short"), null);
  assert.equal(parseStartCode(`hello ${CODE}`), null);
  assert.equal(parseStartCode(`/start ${CODE} extra`), null);
  assert.equal(parseStartCode(undefined), null);
});

test("the webhook secret must match exactly; an unset secret rejects everything", () => {
  assert.equal(webhookSecretOk("s3cret-value", "s3cret-value"), true);
  assert.equal(webhookSecretOk("s3cret-valuX", "s3cret-value"), false);
  assert.equal(webhookSecretOk("short", "s3cret-value"), false);
  assert.equal(webhookSecretOk(null, "s3cret-value"), false);
  assert.equal(webhookSecretOk("", "s3cret-value"), false);
  assert.equal(webhookSecretOk("anything", undefined), false);
  assert.equal(webhookSecretOk("", ""), false);
});

test("no token: sending is a silent no-op and never calls the network", async () => {
  let called = 0;
  const f = (() => {
    called++;
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  assert.equal(await sendTelegram(undefined, 1, "hi", f), false);
  assert.equal(await sendTelegram("", 1, "hi", f), false);
  assert.equal(called, 0);
});

test("sendTelegram posts to the Bot API and reports success", async () => {
  let url = "";
  let body: Record<string, unknown> = {};
  const f = ((u: string, init: RequestInit) => {
    url = u;
    body = JSON.parse(String(init.body));
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  assert.equal(await sendTelegram("123:abc", 42, "hello", f), true);
  assert.equal(url, "https://api.telegram.org/bot123:abc/sendMessage");
  assert.equal(body.chat_id, 42);
  assert.equal(body.text, "hello");
});

test("sendTelegram never throws: network errors and HTTP errors return false", async () => {
  const down = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
  assert.equal(await sendTelegram("123:abc", 42, "hi", down), false);
  const rejected = (() => Promise.resolve(new Response("nope", { status: 403 }))) as typeof fetch;
  assert.equal(await sendTelegram("123:abc", 42, "hi", rejected), false);
  const broken = (() => {
    throw new Error("boom");
  }) as unknown as typeof fetch;
  assert.equal(await sendTelegram("123:abc", 42, "hi", broken), false);
});

// A stand-in for supabase-js: rows keyed by table name. Supports select/eq/update/maybeSingle.
function fakeDb(tables: Record<string, Record<string, unknown>[]>, failWith?: Error) {
  const updates: { table: string; patch: Record<string, unknown> }[] = [];
  const db = {
    from: (table: string) => {
      const rows = (tables[table] ??= []);
      let patch: Record<string, unknown> | null = null;
      let filter: (r: Record<string, unknown>) => boolean = () => true;
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          const prev = filter;
          filter = (r) => prev(r) && r[col] === v;
          return q;
        },
        update: (p: Record<string, unknown>) => {
          patch = p;
          return q;
        },
        maybeSingle: () => {
          if (failWith) return Promise.resolve({ data: null, error: failWith });
          const hit = rows.find(filter) ?? null;
          if (hit && patch) {
            Object.assign(hit, patch);
            updates.push({ table, patch });
          }
          return Promise.resolve({ data: hit, error: null });
        },
      };
      return q;
    },
  };
  return { db: db as unknown as SupabaseClient, updates };
}

test("notifyOwner sends to the linked chat and is a no-op without a token or a link", async () => {
  const { db } = fakeDb({ store_telegram: [{ store_id: "s1", chat_id: 77 }] });
  const sent: string[] = [];
  const f = ((u: string, init: RequestInit) => {
    sent.push(String(JSON.parse(String(init.body)).chat_id));
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  assert.equal(await notifyOwner(db, () => undefined, "s1", "x", f), false);
  assert.equal(sent.length, 0);

  const env = (k: string) => (k === "TELEGRAM_BOT_TOKEN" ? "123:abc" : undefined);
  assert.equal(await notifyOwner(db, env, "s1", "x", f), true);
  assert.deepEqual(sent, ["77"]);

  const { db: unlinked } = fakeDb({ store_telegram: [{ store_id: "s2", chat_id: null }] });
  assert.equal(await notifyOwner(unlinked, env, "s2", "x", f), false);
  assert.equal(sent.length, 1);
});

test("notifyOwner never throws when the database fails", async () => {
  const { db } = fakeDb({}, new Error("db down"));
  const env = (k: string) => (k === "TELEGRAM_BOT_TOKEN" ? "123:abc" : undefined);
  const f = (() => Promise.resolve(new Response("{}"))) as typeof fetch;
  assert.equal(await notifyOwner(db, env, "s1", "x", f), false);
});

test("/start with a valid code links the chat, clears the code and confirms by name", async () => {
  const { db, updates } = fakeDb({
    store_telegram: [{ store_id: "s1", link_code: CODE, chat_id: null }],
    stores: [{ id: "s1", name: "Boutique Oran" }],
  });
  const replies: string[] = [];
  const f = ((_u: string, init: RequestInit) => {
    replies.push(JSON.parse(String(init.body)).text);
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  const outcome = await handleTelegramUpdate(db, "123:abc", {
    message: { text: `/start ${CODE}`, chat: { id: 555 } },
  }, f);
  assert.equal(outcome, "linked");
  assert.equal(updates[0].table, "store_telegram");
  assert.equal(updates[0].patch.chat_id, 555);
  assert.equal(updates[0].patch.link_code, null);
  assert.deepEqual(replies, ["Connected: you'll get alerts for Boutique Oran."]);
});

test("an unknown or reused code is told the link expired and nothing is linked", async () => {
  const { db, updates } = fakeDb({ store_telegram: [{ store_id: "s1", link_code: CODE }], stores: [{ id: "s1", name: "Boutique" }] });
  const replies: string[] = [];
  const f = ((_u: string, init: RequestInit) => {
    replies.push(JSON.parse(String(init.body)).text);
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  const outcome = await handleTelegramUpdate(db, "123:abc", {
    message: { text: "/start ffffffffffffffffffffffffffffffff", chat: { id: 9 } },
  }, f);
  assert.equal(outcome, "unknown_code");
  assert.equal(updates.length, 0);
  assert.match(replies[0], /expired/);
});

test("without a token, or for messages that are not /start, the update is ignored", async () => {
  const { db, updates } = fakeDb({ store_telegram: [{ store_id: "s1", link_code: CODE }], stores: [{ id: "s1", name: "B" }] });
  const f = (() => {
    throw new Error("must not be called");
  }) as unknown as typeof fetch;
  assert.equal(
    await handleTelegramUpdate(db, undefined, { message: { text: `/start ${CODE}`, chat: { id: 1 } } }, f),
    "ignored",
  );
  assert.equal(
    await handleTelegramUpdate(db, "123:abc", { message: { text: "hello", chat: { id: 1 } } }, f),
    "ignored",
  );
  assert.equal(updates.length, 0);
});
