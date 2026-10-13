// Who runs the service, as shown on the public privacy, terms and data-deletion pages.
// Set these at build time (Cloudflare Pages → Settings → Environment variables). Meta reviews these
// pages, and the operator name must match the legal name on the business registration.
const env = import.meta.env as Record<string, string | undefined>;

export const legal = {
  product: env.VITE_LEGAL_PRODUCT || "Store Assistant DZ",
  operator: env.VITE_LEGAL_OPERATOR || "[Operator name: set VITE_LEGAL_OPERATOR]",
  location: env.VITE_LEGAL_LOCATION || "Algeria",
  email: env.VITE_LEGAL_EMAIL || "[Contact email: set VITE_LEGAL_EMAIL]",
  updated: "13 October 2026",
};
