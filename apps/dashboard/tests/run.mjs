// Builds the app against the mock backend, then runs the browser smoke test.
import { spawnSync } from "node:child_process";

const build = spawnSync("npx", ["vite", "build", "--outDir", ".test-dist", "--emptyOutDir", "--logLevel", "error"], {
  stdio: "inherit",
  env: { ...process.env, VITE_SUPABASE_URL: `http://127.0.0.1:${process.env.MOCK_PORT || 54321}`, VITE_SUPABASE_ANON_KEY: "test-anon-key" },
});
if (build.status !== 0) process.exit(build.status ?? 1);
await import("./smoke.mjs");
