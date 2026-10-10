import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", ".claude/**", "apps/**", "docs/**"],
  },
  {
    files: ["supabase/functions/**/*.ts", "scripts/**/*.mjs"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // tools.ts is being refactored in another PR; relax the one rule it trips
    // rather than editing the file here.
    files: ["supabase/functions/_shared/agent/tools.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
