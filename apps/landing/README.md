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

- `PUBLIC_APP_URL` - the Wakil dashboard origin. Used for the "Start free" (`/signup`) and "Log in" (`/login`) links and the legal links. Defaults to `http://localhost:5173` when unset. Set it empty to use same-origin paths (the combined site build does this). See `.env.example`.
- `PUBLIC_SITE_URL` - the landing site's own public origin, used for canonical and hreflang links. Defaults to `http://localhost:4321`.

## Copy

All strings live in `src/i18n.ts`. The page layout is `src/components/Landing.astro`.

## Deploy (one site with the dashboard)

The landing and the dashboard are one Cloudflare Pages site, `store-assistant-dz`, served at https://store-assistant-dz.pages.dev. From the repo root:

```bash
npm run build:site   # dashboard build, then landing build (PUBLIC_APP_URL empty, PUBLIC_SITE_URL=https://store-assistant-dz.pages.dev), then merged into apps/dashboard/dist
npx wrangler@4.30.0 pages deploy apps/dashboard/dist --project-name store-assistant-dz --branch main
```

`scripts/build-site.sh` stops if a landing file would overwrite a dashboard file (only the shared `fonts/` may overlap, and only identical files). The landing's `index.html` becomes the site root.

With `PUBLIC_APP_URL` empty, the "Log in", "Start free" and legal links are same-origin paths (`/login`, `/signup`, `/privacy`).

Routing: the landing is static and served at `/`, `/fr/`, `/en/`. Dashboard routes are listed in `apps/dashboard/public/_redirects`, each rewritten to `/app`, which serves the dashboard shell `app.html`. There is no catch-all, so unknown paths are not sent to the dashboard.

Supabase: the Site URL should be `https://store-assistant-dz.pages.dev/login`, and `https://store-assistant-dz.pages.dev/login` must be in the redirect allow-list (sign-up and magic-link emails return there).
