import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dashboard is served from app.html for every SPA route. In production the routes are
// rewritten by public/_redirects; in `vite` and `vite preview` this plugin does the same.
// Requests for real files (anything with an extension) and Vite internals pass through.
const APP_ENTRY = "/app.html";

function spaFallback(): Plugin {
  const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
    const url = req.url ?? "/";
    const path = url.split("?")[0];
    const isInternal = /^\/(@|src\/|node_modules\/|__)/.test(path);
    const hasExtension = /\.[a-z0-9]+$/i.test(path);
    if ((req.method === "GET" || req.method === "HEAD") && !isInternal && !hasExtension) {
      req.url = APP_ENTRY + url.slice(path.length);
    }
    next();
  };
  return {
    name: "dashboard-spa-fallback",
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL("./app.html", import.meta.url)),
    },
  },
});
