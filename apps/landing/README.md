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
