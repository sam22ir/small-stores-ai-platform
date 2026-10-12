import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useI18n } from "./i18n";
import { useRealtimeRefresh } from "./store";
import { alertBody, newHandoffs, NOTIFY_KEY, readPref, SOUND_KEY, titleWithCount, waitingIds, waitingRows } from "./handoffAlerts";
import type { HandoffRow } from "./handoffAlerts";

// Most chats the title count and the baseline look at. The count in the title tops out here.
const LIMIT = 100;

type RawRow = {
  id: string;
  status: string;
  handoff_reason: string | null;
  customers: { display_name: string | null } | null;
  channels: { platform: string } | null;
};

let audio: AudioContext | null = null;

// A short beep (about 150 ms). Sound is best effort: any failure is swallowed.
function beep() {
  try {
    if (!audio) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio = new Ctor();
    }
    const ctx = audio;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } catch {
    /* no audio available */
  }
}

// One browser notification for the first new chat (more are summarised as "(+N)").
// Only shown when the owner turned them on here and the browser has granted permission.
function notify(title: string, fresh: HandoffRow[], unnamed: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const first = fresh[0];
    const more = fresh.length - 1;
    const body = alertBody(first.customer_name ?? unnamed, first.handoff_reason ?? "") + (more > 0 ? ` (+${more})` : "");
    new Notification(title, { body, tag: first.id });
  } catch {
    /* notifications unsupported here (some mobile browsers throw) */
  }
}

// Keeps the waiting-chat count for this owner: the tab title shows it, and new handoffs can beep or notify.
// The first successful load only sets the baseline. Mounted once, in Layout. Polling is the fallback.
export function useHandoffAlerts(storeId: string | undefined) {
  const { t } = useI18n();
  const tRef = useRef(t);
  const [waiting, setWaiting] = useState(0);
  // Ids waiting after the last successful load. null until the first load (the baseline).
  const previous = useRef<Set<string> | null>(null);
  // Discards a slow response that a newer load has overtaken.
  const seq = useRef(0);
  const baseTitle = useRef<string | null>(null);

  useEffect(() => { tRef.current = t; }, [t]);

  // The title as it was when the app mounted. It is put back on unmount (for example on sign-out).
  useEffect(() => {
    const base = document.title;
    baseTitle.current = base;
    return () => { document.title = base; baseTitle.current = null; };
  }, []);

  useEffect(() => {
    if (baseTitle.current !== null) document.title = titleWithCount(baseTitle.current, waiting);
  }, [waiting]);

  const load = useCallback(async () => {
    if (!storeId) return;
    const req = ++seq.current;
    const { data, error } = await supabase.from("conversations")
      .select("id, status, handoff_reason, customers(display_name), channels!inner(platform)")
      .eq("store_id", storeId).eq("status", "human").not("handoff_reason", "is", null)
      .neq("channels.platform", "playground")
      .order("last_customer_message_at", { ascending: false, nullsFirst: false })
      .limit(LIMIT);
    // On error keep the old state: a failed load must not look like "everything was resolved".
    if (error || !data || req !== seq.current) return;

    const rows: HandoffRow[] = (data as unknown as RawRow[]).map((r) => ({
      id: r.id,
      status: r.status,
      handoff_reason: r.handoff_reason,
      customer_name: r.customers?.display_name ?? null,
      platform: r.channels?.platform ?? null,
    }));
    const fresh = newHandoffs(previous.current, rows);
    previous.current = waitingIds(rows);
    setWaiting(waitingRows(rows).length);

    if (fresh.length > 0) {
      // Preferences are read now, not at mount, so a Settings change applies straight away.
      if (readPref(SOUND_KEY)) beep();
      if (readPref(NOTIFY_KEY)) notify(tRef.current("alerts.notifyTitle"), fresh, tRef.current("alerts.unknownCustomer"));
    }
  }, [storeId]);

  // A new store is a new baseline.
  useEffect(() => {
    previous.current = null;
    void load();
  }, [load]);

  useRealtimeRefresh("conversations", storeId ? `store_id=eq.${storeId}` : undefined, load);
}
