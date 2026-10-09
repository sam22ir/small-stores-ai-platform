import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// One SPA: index.html serves every route. Production uses public/_redirects, and Vite's
// dev server and preview fall back to index.html for unknown paths by default.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
});
