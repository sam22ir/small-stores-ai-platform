# Wakil landing

Static Astro site for Wakil. Three locales: Arabic at `/` (default), French at `/fr/`, English at `/en/`.

## Run

```sh
npm install
npm run dev       # local dev server
npm run build     # static build into dist/
npm run preview   # serve dist/ locally
```

## Environment

- `PUBLIC_APP_URL` - the Wakil dashboard origin. Used for the "Start free" (`/signup`) and "Log in" (`/login`) links and the legal links. Defaults to `http://localhost:5173`. See `.env.example`.
- `PUBLIC_SITE_URL` - the landing site's own public origin, used for canonical and hreflang links. Defaults to `http://localhost:4321`.

## Copy

All strings live in `src/i18n.ts`. The page layout is `src/components/Landing.astro`.

## Deploy

Build the static site with the production URLs, then deploy `dist` to the Cloudflare Pages project `wakil` (branch `main`). Log in first with `npx wrangler login` if needed. No secrets are stored in the repo. Wrangler 4.30.0 is pinned because newer wrangler versions redirect Pages commands to Workers.

```bash
npm ci
PUBLIC_APP_URL=https://store-assistant-dz.pages.dev PUBLIC_SITE_URL=https://wakil-3x3.pages.dev npm run build
npx wrangler@4.30.0 pages deploy dist --project-name wakil --branch main --commit-dirty=true
```

The project's assigned subdomain is `wakil-3x3.pages.dev`. Production URL: https://wakil-3x3.pages.dev/
