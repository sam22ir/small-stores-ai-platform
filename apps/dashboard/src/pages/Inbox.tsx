import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useMatch } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { formatTime } from "../lib/format";
import { useConversationsRefresh, useStore } from "../lib/store";
import { SetupChecklist } from "../components/SetupChecklist";

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

// Shown on the right of the list on wide screens when no chat is open.
export function InboxEmpty() {
  const { t } = useI18n();
  return (
    <div className="card flex-1 min-h-[60vh] items-center justify-center p-6 text-center muted hidden lg:flex">
      {t("inbox.selectConversation")}
    </div>
  );
}

function ChatRow({ c, preview, active, showStatus }: { c: Conv; preview?: Preview; active: boolean; showStatus: boolean }) {
  const { t, lang } = useI18n();
  const name = c.customers?.display_name || c.customers?.platform_user_id || t("inbox.customer");
  const chipStyle = c.status === "human"
    ? { background: "var(--warn-soft)", color: "var(--warn)" }
    : c.status === "bot"
      ? { background: "var(--brand-soft)", color: "var(--brand)" }
      : { background: "var(--surface-2)", color: "var(--heading)" };
  return (
    <Link to={`/inbox/${c.id}`} aria-current={active ? "page" : undefined}
      className="flex items-center gap-3 px-4 py-3 no-underline min-h-[56px] border-b last:border-b-0"
      style={{ color: "inherit", borderColor: "var(--divider)", background: active ? "var(--brand-soft)" : "transparent" }}>
      <span aria-hidden="true" className="shrink-0 grid place-items-center rounded-full text-sm font-semibold"
        style={{ width: 36, height: 36, background: "var(--surface-2)", color: "var(--heading)" }}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-[15px] truncate" style={{ color: "var(--text)" }}>{name}</span>
        <span className="block text-[13px] muted truncate">{preview?.body ?? t("inbox.noMessages")}</span>
        {c.status === "human" && c.handoff_reason && (
          <span className="block text-[13px] truncate mt-0.5" style={{ color: "var(--warn)" }}>{c.handoff_reason}</span>
        )}
      </span>
      <span className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-xs muted">{formatTime(preview?.created_at ?? c.last_customer_message_at, lang)}</span>
        {showStatus && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={chipStyle}>
            {t(c.status === "human" ? "inbox.needsYou" : c.status === "bot" ? "inbox.assistant" : "inbox.closed")}
          </span>
        )}
      </span>
    </Link>
  );
}

export function Inbox() {
  const { t } = useI18n();
  const { store } = useStore();
  const match = useMatch("/inbox/:id");
  const open = match !== null;
  const activeId = match?.params.id;
  const [tab, setTab] = useState<Status>("human");
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [failed, setFailed] = useState(false);
  const [aiProblems, setAiProblems] = useState(0);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id,status,handoff_reason,last_customer_message_at,created_at,customers(display_name,platform_user_id),channels(platform)")
      .order("last_customer_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) { setFailed(true); return; }
    // Messages the assistant could not answer (model outage) in the last day.
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await supabase.from("agent_runs").select("id", { count: "exact", head: true })
      .eq("source", "customer").not("error", "is", null).gte("created_at", since);
    setAiProblems(count ?? 0);
    // Test chats from the Assistant page live in the same tables; they aren't customers.
    const rows = (data as unknown as Conv[]).filter((c) => c.channels?.platform !== "playground");
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

  useEffect(() => { void load(); }, [load]);
  // Refreshes on realtime changes to this store's chats; polls every 60 s (15 s if realtime is down).
  useConversationsRefresh(store?.id, load);

  const counts = (s: Status) => (convs ?? []).filter((c) => c.status === s).length;
  const human = (convs ?? []).filter((c) => c.status === "human");
  // The "Needs you" box already lists those chats, so the Needs-you tab shows the box alone.
  const listRows = tab === "human" ? [] : (convs ?? []).filter((c) => c.status === tab);
  const current = TABS.find((x) => x.status === tab)!;
  const showEmpty = convs !== null && (tab === "human" ? human.length === 0 : listRows.length === 0);

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-4 min-w-0">
      <section aria-label={t("inbox.title")}
        className={`${open ? "hidden lg:flex" : "flex"} flex-col gap-3 min-w-0 lg:w-[380px] lg:shrink-0`}>
        <h1 className="text-xl font-semibold mt-1 mb-1" style={{ color: "var(--heading)" }}>{t("inbox.title")}</h1>
        <SetupChecklist />

        {aiProblems > 0 && (
          <div className="rounded-xl px-4 py-3 text-sm border" role="status"
            style={{ background: "var(--warn-soft)", color: "var(--warn)", borderColor: "var(--warn-border)" }}>
            {t("inbox.aiProblem", { n: aiProblems })}
          </div>
        )}
        {failed && <p className="error">{t("common.error")} <button className="btn btn-small" onClick={() => void load()}>{t("common.retry")}</button></p>}
        {!convs && !failed && <p className="muted">{t("common.loading")}</p>}

        {human.length > 0 && (
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 h-11 border-b"
              style={{ background: "var(--warn-soft)", borderColor: "var(--warn-border)" }}>
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: "var(--warn)" }} />
                <h2 className="m-0 text-sm font-semibold" style={{ color: "var(--warn)" }}>{t("inbox.needsYou")}</h2>
              </div>
              <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: "var(--warn)" }}>
                {t("inbox.waitingCount", { n: human.length })}
              </span>
            </div>
            {human.map((c) => (
              <ChatRow key={c.id} c={c} preview={previews[c.id]} active={activeId === c.id} showStatus={false} />
            ))}
          </div>
        )}

        <div role="tablist" className="flex flex-wrap gap-2">
          {TABS.map((x) => (
            <button key={x.status} role="tab" className="tab" aria-selected={tab === x.status} onClick={() => setTab(x.status)}>
              {t(x.key)}{convs ? ` (${counts(x.status)})` : ""}
            </button>
          ))}
        </div>

        {showEmpty && <p className="muted card p-5 m-0">{t(tab === "human" ? "inbox.emptyNeeds" : current.empty)}</p>}

        {listRows.length > 0 && (
          <div className="card overflow-hidden">
            {listRows.map((c) => (
              <ChatRow key={c.id} c={c} preview={previews[c.id]} active={activeId === c.id} showStatus />
            ))}
          </div>
        )}
      </section>

      <div className={`${open ? "flex" : "hidden lg:flex"} flex-col flex-1 min-w-0`}>
        <Outlet />
      </div>
    </div>
  );
}
