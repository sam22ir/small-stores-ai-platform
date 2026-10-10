# Load testing the Telegram webhook

`scripts/loadtest.mjs` sends signed Telegram updates to the `telegram-webhook` function and reports p50, p95 and p99 latency, error rate and throughput.

## Read this first

- Run it only against a **test store** or a **Supabase branch**. Never run it against real customers or the production project.
- Each update can trigger **real AI calls and cost money**. Keep `-n` small and watch your provider's usage.
- The script refuses to run unless `LOADTEST_CONFIRM=yes` is set.

## Setup

Node 22 or newer. No dependencies to install.

| Variable | Purpose |
| --- | --- |
| `LOADTEST_CONFIRM` | Must be `yes`. |
| `TELEGRAM_WEBHOOK_URL` | The webhook URL of the test branch, for example `https://<branch-ref>.supabase.co/functions/v1/telegram-webhook`. |
| `TELEGRAM_WEBHOOK_SECRET` | The test branch's webhook secret. Sent in the `X-Telegram-Bot-Api-Secret-Token` header. Keep it out of shell history and logs. |

## Run

```sh
LOADTEST_CONFIRM=yes \
TELEGRAM_WEBHOOK_URL=https://<branch-ref>.supabase.co/functions/v1/telegram-webhook \
TELEGRAM_WEBHOOK_SECRET=... \
node scripts/loadtest.mjs -c 20 -n 200
```

- `-c` concurrency, default 20.
- `-n` total requests, default 200.

The output shows request count, p50, p95 and p99 latency, error rate (non-2xx responses or network failures) and throughput in requests per second.

## Checklist before running

1. The target is a test store or branch, and you have confirmed that from the URL.
2. You accept that each update may call the AI model and cost money.
3. Start with a small `-n` to check the setup.
