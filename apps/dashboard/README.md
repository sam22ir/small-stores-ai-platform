# Owner dashboard

A static web app (Vite + React + TypeScript) for store owners. It talks straight to Supabase from the browser,
so it can be hosted for free on Cloudflare Pages. It is also an installable app (web manifest + service worker).

**What owners can do**

- **Chats** (inbox): conversations the assistant handed over ("Needs you"), ones it is handling, and closed ones. Open a chat to read it, write a reply, hand it back to the assistant, or close it.
- **Catalog**: add and edit products and options (size, color), set prices, and change stock with one tap. Hide a product from the assistant without deleting it.
- **Settings**: store name, currency, time zone, "what the assistant should know" (hours, delivery, payment, returns) and an on/off switch.
- **Channels**: Facebook and Instagram connection is "coming soon" until the Meta step.
- Languages: Arabic (right-to-left), French and English. The Arabic and French text is a first draft and needs a native speaker's review.

## Run it locally

```sh
cd apps/dashboard
cp .env.example .env      # already points at the project; the key is the public (publishable) one
npm install
npm run dev               # http://localhost:5173
```

The first account you create gets the "Set up your store" screen, which calls the `create_store` database function.

## Supabase settings to check

- **Authentication → URL Configuration:** add your Cloudflare Pages URL as the Site URL, and add `http://localhost:5173` as a redirect URL.
- **Authentication → Providers → Email:** email confirmation is on by default, so new users must click the link in an email before they can sign in. Turn it off while testing if you prefer.

## Deploy on Cloudflare Pages (free)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the GitHub repository.
2. Settings: **Root directory** `apps/dashboard`, **Build command** `npm run build`, **Build output directory** `dist`.
3. Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (same as `.env.example`) and `NODE_VERSION` = `22`.
4. `public/_redirects` makes deep links work and `public/_headers` sets security headers, including a content-security-policy that only allows this origin and `*.supabase.co`. If you add another API host, add it to `connect-src` there.

## Security model

- The browser only ever holds the **publishable key**. Never put the service-role key in this app.
- What a signed-in owner can do is limited by database permissions (migration `0008`) and row-level security: read their own store's data, edit store settings, hand conversations back or close them, add owner replies, and manage the catalog. They cannot create channels, customers or agent runs, or read channel credentials.
- Passwords are handled by Supabase Auth; the app never stores them.

## Known limits

- Owner replies are **saved, not delivered**, until Instagram/Facebook are connected. They show "Saved. Not sent yet".
- The "Assistant is on" switch applies to live channels. The test chat on the Assistant page ignores it, so you can always try the assistant.
- No push notifications yet (planned: Telegram alert, then web push).
- No realtime updates: the inbox refreshes every 15 s and an open chat every 8 s.

## Checks

```sh
npm run typecheck
npm run test:ui     # builds against a mock Supabase and drives a real browser: 32 checks, screenshots in .test-shots/
```

`test:ui` needs a Chromium: set `CHROMIUM_PATH` to an existing Chrome/Chromium, or run `npx playwright-core install chromium` once.

## Regenerating database types

`src/lib/database.types.ts` comes from the Supabase schema. Regenerate it after schema changes
(Supabase CLI: `supabase gen types typescript --project-id <ref>`).
