import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { formatTime } from "../lib/format";

type Status = "human" | "bot" | "closed";
type Conv = {
  id: string;
  status: Status;
  handoff_reason: string | null;
  last_customer_message_at: string | null;
  created_at: string;
  customers: { display_name: string | null; platform_user_id: string } | null;
  channels: { platform: string } | null;
};
type Preview = { body: string | null; created_at: string; direction: string };

const TABS: { status: Status; key: TKey; empty: TKey }[] = [
  { status: "human", key: "inbox.needsYou", empty: "inbox.emptyNeeds" },
  { status: "bot", key: "inbox.assistant", empty: "inbox.emptyAssistant" },
  { status: "closed", key: "inbox.closed", empty: "inbox.emptyClosed" },
];

export const platformKey = (p: string | undefined): TKey =>
  p === "instagram" ? "channels.instagram" : p === "facebook" ? "channels.facebook" : "channels.playground";

export function Inbox() {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Status>("human");
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id,status,handoff_reason,last_customer_message_at,created_at,customers(display_name,platform_user_id),channels(platform)")
      .order("last_customer_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) { setFailed(true); return; }
    const rows = data as unknown as Conv[];
    setConvs(rows); setFailed(false);

    if (rows.length === 0) return;
    const { data: msgs } = await supabase
      .from("messages").select("conversation_id,body,created_at,direction")
      .in("conversation_id", rows.map((r) => r.id))
      .order("created_at", { ascending: false }).limit(500);
    const latest: Record<string, Preview> = {};
    for (const m of msgs ?? []) if (!latest[m.conversation_id]) latest[m.conversation_id] = m;
    setPreviews(latest);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => window.clearInterval(id);
  }, [load]);

  const counts = (s: Status) => (convs ?? []).filter((c) => c.status === s).length;
  const visible = (convs ?? []).filter((c) => c.status === tab);
  const current = TABS.find((x) => x.status === tab)!;

  return (
    <div>
      <h1 className="text-2xl font-extrabold mt-1 mb-4">{t("inbox.title")}</h1>
      <div role="tablist" className="flex flex-wrap gap-2 mb-4">
        {TABS.map((x) => (
          <button key={x.status} role="tab" className="tab" aria-selected={tab === x.status} onClick={() => setTab(x.status)}>
            {t(x.key)}{convs ? ` (${counts(x.status)})` : ""}
          </button>
        ))}
      </div>

      {failed && <p className="error">{t("common.error")} <button className="btn btn-small" onClick={() => void load()}>{t("common.retry")}</button></p>}
      {!convs && !failed && <p className="muted">{t("common.loading")}</p>}
      {convs && visible.length === 0 && <p className="muted card p-5">{t(current.empty)}</p>}

      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {visible.map((c) => {
          const p = previews[c.id];
          return (
            <li key={c.id}>
              <Link to={`/inbox/${c.id}`} className="card p-4 flex flex-col gap-1 no-underline" style={{ color: "inherit" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold truncate">{c.customers?.display_name || c.customers?.platform_user_id || t("inbox.customer")}</span>
                  <span className="muted text-xs shrink-0">{formatTime(p?.created_at ?? c.last_customer_message_at, lang)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="badge badge-muted">{t(platformKey(c.channels?.platform))}</span>
                </div>
                <div className="muted text-sm truncate">{p?.body ?? t("inbox.noMessages")}</div>
                {c.status === "human" && c.handoff_reason && (
                  <div className="text-sm rounded-lg px-3 py-2 mt-1" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>
                    {c.handoff_reason}
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
