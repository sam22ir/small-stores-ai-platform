// After a deploy, a tab that was open before it still points at JS files that no longer exist. The host
// answers those requests with the HTML page, so the import fails and the screen stays on the skeleton.
// Reloading fetches the fresh page (and its new file names). The guard stops a reload loop when the
// failure is something else: one automatic reload per window of time, otherwise the error surfaces.

const KEY = "chunk-reload-at";
const WINDOW_MS = 30_000;

interface Env {
  storage: Pick<Storage, "getItem" | "setItem">;
  reload: () => void;
  now: () => number;
}

const browserEnv = (): Env => ({
  storage: sessionStorage,
  reload: () => location.reload(),
  now: () => Date.now(),
});

// Returns true when it started a reload, false when a reload already happened recently.
export function reloadForNewDeploy(env: Env = browserEnv()): boolean {
  try {
    const last = Number(env.storage.getItem(KEY));
    if (Number.isFinite(last) && last > 0 && env.now() - last < WINDOW_MS) return false;
    env.storage.setItem(KEY, String(env.now()));
  } catch {
    return false; // no storage (private mode): a guard we cannot keep is worse than showing the error
  }
  env.reload();
  return true;
}

// Wraps a dynamic import(). On failure it reloads once; the returned promise then never settles so the
// error screen does not flash before the page reloads.
export function importWithReload<T>(load: () => Promise<T>, env?: Env): Promise<T> {
  return load().catch((err: unknown) => {
    if (reloadForNewDeploy(env)) return new Promise<T>(() => {});
    throw err;
  });
}
