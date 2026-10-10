#!/usr/bin/env node
// Load test for the Telegram webhook. Sends N signed (secret-header) Telegram updates with concurrency C.
//
// WARNING: every update can trigger real AI calls and cost money. Run only against a TEST store or a
// Supabase branch. Never run it against real customers or production. See docs/load-testing.md.
//
// Usage:
//   LOADTEST_CONFIRM=yes TELEGRAM_WEBHOOK_URL=https://<branch-ref>.supabase.co/functions/v1/telegram-webhook \
//   TELEGRAM_WEBHOOK_SECRET=... node scripts/loadtest.mjs -c 20 -n 200
//
// Options: -c concurrency (default 20), -n total requests (default 200).
// Requires Node 22+ (built-in fetch). No dependencies.

const SECRET_HEADER = "x-telegram-bot-api-secret-token"; // matched by supabase/functions/telegram-webhook

function parseArgs(argv) {
  const opts = { concurrency: 20, total: 200 };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "-c") {
      opts.concurrency = Number(value);
      i++;
    } else if (flag === "-n") {
      opts.total = Number(value);
      i++;
    } else {
      throw new Error(`unknown argument: ${flag}`);
    }
  }
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) throw new Error("-c must be a positive integer");
  if (!Number.isInteger(opts.total) || opts.total < 1) throw new Error("-n must be a positive integer");
  return opts;
}

function buildUpdate(seq) {
  // A fake private chat for the test store. The webhook only links chats on "/start <code>",
  // so plain text messages exercise the normal inbound path.
  return {
    update_id: 900000000 + seq,
    message: {
      message_id: seq,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 4242424242, type: "private" },
      from: { id: 4242424242, is_bot: false, first_name: "LoadTest" },
      text: `loadtest ping ${seq}`,
    },
  };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  if (process.env.LOADTEST_CONFIRM !== "yes") {
    console.error("Refusing to run: set LOADTEST_CONFIRM=yes after confirming the target is a TEST store or branch.");
    process.exit(1);
  }
  const url = process.env.TELEGRAM_WEBHOOK_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.error("Missing TELEGRAM_WEBHOOK_URL or TELEGRAM_WEBHOOK_SECRET.");
    process.exit(1);
  }

  const { concurrency, total } = parseArgs(process.argv.slice(2));
  const latencies = [];
  let errors = 0;
  let next = 0;

  async function worker() {
    while (true) {
      const seq = next++;
      if (seq >= total) return;
      const started = performance.now();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", [SECRET_HEADER]: secret },
          body: JSON.stringify(buildUpdate(seq)),
        });
        if (!res.ok) errors++;
        await res.arrayBuffer();
      } catch {
        errors++;
      }
      latencies.push(performance.now() - started);
    }
  }

  const began = performance.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  const elapsedSec = (performance.now() - began) / 1000;

  const sorted = [...latencies].sort((a, b) => a - b);
  const fmt = (ms) => `${ms.toFixed(1)} ms`;
  console.log(`requests:    ${latencies.length} (concurrency ${Math.min(concurrency, total)})`);
  console.log(`p50:         ${fmt(percentile(sorted, 50))}`);
  console.log(`p95:         ${fmt(percentile(sorted, 95))}`);
  console.log(`p99:         ${fmt(percentile(sorted, 99))}`);
  console.log(`error rate:  ${((errors / latencies.length) * 100).toFixed(2)}% (${errors} failed)`);
  console.log(`throughput:  ${(latencies.length / elapsedSec).toFixed(2)} req/s over ${elapsedSec.toFixed(1)} s`);
}

main().catch((err) => {
  console.error("loadtest failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
