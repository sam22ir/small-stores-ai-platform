import { defineConfig } from 'astro/config';

// PUBLIC_SITE_URL is the landing site's own public origin (used for canonical and hreflang links).
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'http://localhost:4321',
  output: 'static',
  trailingSlash: 'always',
});
