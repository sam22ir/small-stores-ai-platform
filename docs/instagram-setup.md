# Connecting Instagram

How a store's Instagram DMs reach the assistant and how its replies go back, and the exact steps to switch it on.
Uses **Instagram API with Instagram Login**: the owner signs in with the shop's Instagram professional account
(Business or Creator). No Facebook Page is needed.

## How it works

```
Owner: Assistant → Channels → "Connect Instagram"
   dashboard ──POST start──► instagram-connect ──► Instagram approval page
   Instagram ──?code&state──► instagram-connect ──► <DASHBOARD_URL>/assistant?instagram=finish&code&state
   dashboard ──POST finish (owner's JWT)──► instagram-connect  (checks the signed state was made for this same
                                                  signed-in owner, swaps the code for a 60-day token,
                                                  saves the account + encrypted token, subscribes to messages)

Customer DMs the shop
   Meta ──POST──► meta-webhook ──► 200 straight away; in the background:
                    store customer/chat/message → assistant (debounced 4 s, locked, limited) → deliver reply
   deliver ──► graph.instagram.com/v25.0/me/messages   (≤ 950 bytes per message, longer replies are split)

Owner replies in the dashboard
   browser saves the message (pending) ──► deliver-messages ──► Instagram
```

Safety properties (all covered by tests in `supabase/functions/_shared/meta/`):

- The webhook only accepts bodies signed with the app secret; our own echoes, self messages and deletions are ignored.
- A retried webhook never duplicates a message; a reply is claimed atomically before sending so it can never go out twice.
- Instagram only allows a reply within **24 hours** of the customer's last message. Later replies are marked **Not delivered** with the reason instead of failing silently.
- Tokens are AES-GCM encrypted with `CREDENTIALS_ENCRYPTION_KEY`, refreshed automatically in their last 10 days, and deleted on Disconnect. An expired or revoked token marks the channel disconnected.
- The login round trip carries a signed, 10-minute `state` tied to the store and owner, and only that same owner, signed in to the dashboard, can complete it. A forwarded approval link can't pull someone else's Instagram account into a store. One Instagram account can belong to only one store. `DASHBOARD_URL` is required for this.
- Only `instagram_business_basic` and `instagram_business_manage_messages` are requested.

## One-time setup

### 1. Database

Apply `supabase/migrations/0015_instagram_delivery.sql` (adds `messages.delivery_claimed_at` and `delivery_error`). Additive only.

### 2. Secrets (Supabase → Edge Functions → Secrets)

| Secret | Value |
|---|---|
| `INSTAGRAM_APP_ID` | Meta dashboard → Instagram → API setup with Instagram login → step 3 → Business login settings |
| `INSTAGRAM_APP_SECRET` | same place. **Never paste it in a chat or commit it.** |
| `META_WEBHOOK_VERIFY_TOKEN` | any long random string you invent, e.g. `openssl rand -hex 24` |
| `CREDENTIALS_ENCRYPTION_KEY` | `openssl rand -base64 32`. Keep a safe copy: if it is lost every store must connect again |
| `DASHBOARD_URL` | the deployed dashboard, e.g. `https://app.example.com` (no trailing slash) |
| `META_GRAPH_API_VERSION` | optional, default `v25.0` |
| `META_APP_SECRET` | optional: the Facebook app secret, only for Messenger later |
| `LLM_*` | the model provider secrets the assistant already uses |

### 3. Deploy the functions

`meta-webhook`, `instagram-connect` and `deliver-messages`, **each with "Verify JWT" off** (the webhook is authenticated by
Meta's signature, the OAuth return has no session, and the other two check the user's token themselves).
`assistant-chat` is unchanged.

### 4. Deploy the dashboard (Cloudflare Pages) and set `VITE_LEGAL_*`

See `apps/dashboard/README.md`. Set `VITE_LEGAL_OPERATOR` to your legal name **exactly as on your business registration**
and `VITE_LEGAL_EMAIL` to your contact email. The pages `/privacy`, `/terms` and `/data-deletion` must open without signing in.

### 5. Meta dashboard

In *Instagram → API setup with Instagram login*:

- **Step 3, Webhooks:** Callback URL `https://<project-ref>.supabase.co/functions/v1/meta-webhook`, Verify token = your
  `META_WEBHOOK_VERIFY_TOKEN` → *Verify and save*, then subscribe to the **`messages`** field.
- **Step 4, Business login:** add the redirect URL `https://<project-ref>.supabase.co/functions/v1/instagram-connect`
  (character for character; no trailing slash).
- **App settings → Basic:** Privacy policy URL `<dashboard>/privacy`, Terms of service URL `<dashboard>/terms`,
  User data deletion → instructions URL `<dashboard>/data-deletion`, an app icon, and a category.
- **Publish** the app (switch to Live). Webhooks are only delivered to a published app. Publishing does **not** open it to the
  public: until App Review, only accounts with a role on the app (Instagram testers) can connect.

### 6. Try it

1. Make sure the shop's Instagram account is a professional account and is an **Instagram tester** of the app (App roles → Roles), invite accepted.
2. Dashboard → Assistant → **Connect Instagram** → sign in as that account → Allow. You land back on the page with "Instagram is connected".
3. From a different Instagram account, send the shop a DM. The reply should arrive within a few seconds (4 s debounce + model time).
4. Reply from the dashboard's chat page: it is delivered, or marked **Not delivered** with the reason.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Verify and save" fails in Meta | `META_WEBHOOK_VERIFY_TOKEN` differs from what you typed, or `meta-webhook` was deployed with Verify JWT on |
| Connect says "isn't set up on this server" | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `CREDENTIALS_ENCRYPTION_KEY` missing |
| Instagram shows "Invalid redirect_uri" | the redirect URL in Meta doesn't match `<SUPABASE_URL>/functions/v1/instagram-connect` exactly |
| Connected, but no reply | the app isn't published; the `messages` webhook field isn't subscribed; the assistant is switched off in Settings; the chat was handed to the owner; the monthly limit was reached |
| Webhook gets 401 | the signature secret is wrong: `INSTAGRAM_APP_SECRET` must be the *Instagram* app secret (the webhook also accepts `META_APP_SECRET`) |
| Replies marked "Not delivered" | the customer's last message is older than 24 hours, or the token expired: Connect again |
| "already connected to another store" | that Instagram account is linked to a different store; Disconnect it there first |

## Telegram alerts

The owner can get a Telegram message when a chat is handed to them, the monthly reply limit is reached, the model is down
(holding reply sent), or a customer places an order. Alerts never delay or change a customer reply, and test chats never send them.

1. **Create a bot:** in Telegram, open `@BotFather`, send `/newbot`, and copy the token it gives you.
2. **Secrets** (Supabase → Edge Functions → Secrets):

   | Secret | Value |
   |---|---|
   | `TELEGRAM_BOT_TOKEN` | the token from BotFather. Unset = alerts are off (silent no-op) |
   | `TELEGRAM_WEBHOOK_SECRET` | any long random string, e.g. `openssl rand -hex 24` |
   | `DASHBOARD_URL` | already used by Instagram; alert messages link to `<DASHBOARD_URL>/inbox/<conversation>` when it is set |

3. **Migration:** apply `supabase/migrations/0016_telegram_alerts.sql`. It adds a server-only `store_telegram` table (no client access); clients use the `telegram_link` / `telegram_unlink` RPCs.
4. **Deploy** `telegram-webhook` with **Verify JWT off**.
5. **Register the webhook** with the secret (replace the placeholders; the token goes in the URL, so don't paste the call in a shared chat):

   ```
   curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -H "content-type: application/json" \
     -d '{"url":"https://<project-ref>.supabase.co/functions/v1/telegram-webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
   ```

6. **Link a store:** the dashboard calls `telegram_link(store_id)` and shows the code. In Telegram, open your bot and send
   `/start <code>`. The bot replies "Connected: you'll get alerts for <store>". Codes are one-time; an old one replies
   "That link has expired". `telegram_unlink(store_id)` stops the alerts.

## Going beyond testers

Opening the app to any store needs **Business Verification** and **App Review** for `instagram_business_manage_messages`
(and `instagram_business_basic`), with a screen recording of the login, an incoming message and the reply arriving in the
Instagram inbox. See `docs/project-plan.md`.

## Not built yet

- Facebook Page (Messenger) channel: connecting and sending.
- Voice notes and images: the assistant is told "[voice message]" / "[image]" arrived, and can ask the customer to write.
- Replies after 24 hours (needs Meta's Human Agent tag).
- A sweeper for replies whose delivery was interrupted while no one has the chat open (an open chat retries every 8 s).
- Delivery error texts are English only.
