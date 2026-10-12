// Pure helpers for the handoff alerts: which chats are waiting for the owner, which ones are new,
// the tab title count, and the per-browser alert preferences. No React or Supabase here, so the
// unit tests (node --test) can run it directly.

// One chat as the alert query returns it.
export type HandoffRow = {
  id: string;
  status: string;
  handoff_reason: string | null;
  customer_name: string | null;
  platform: string | null;
};

// A chat is waiting only when the agent handed it over (a reason is set) and it is still with a human.
// An owner reply also sets status 'human', but it leaves the reason alone, so it is not a new handoff
// unless the chat already had one. Test chats (playground) are never customers.
export function isWaiting(row: HandoffRow): boolean {
  return row.status === "human" && row.handoff_reason !== null && row.platform !== "playground";
}

export function waitingRows(rows: readonly HandoffRow[]): HandoffRow[] {
  return rows.filter(isWaiting);
}

export function waitingIds(rows: readonly HandoffRow[]): Set<string> {
  return new Set(waitingRows(rows).map((r) => r.id));
}

// New handoffs since the last load. `previous` is null before the first load: that load only sets the
// baseline, so chats that were already waiting when the owner opened the app never alert.
export function newHandoffs(previous: ReadonlySet<string> | null, rows: readonly HandoffRow[]): HandoffRow[] {
  if (previous === null) return [];
  return waitingRows(rows).filter((r) => !previous.has(r.id));
}

export function titleWithCount(base: string, n: number): string {
  return n > 0 ? `(${n}) ${base}` : base;
}

export function alertBody(name: string, reason: string): string {
  return `${name}: ${reason}`;
}

export const SOUND_KEY = "wakil.alerts.sound";
export const NOTIFY_KEY = "wakil.alerts.notify";

type PrefStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

// Reading globalThis.localStorage can itself throw (blocked storage), so the lookup sits inside the try.
function defaultStorage(): PrefStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Alerts are off until the owner turns them on. Any storage failure reads as off.
export function readPref(key: string, storage: PrefStorage | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

// Best effort: if storage is unavailable the setting simply does not persist.
export function writePref(key: string, on: boolean, storage: PrefStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(key, on ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}
