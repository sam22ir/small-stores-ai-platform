import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useConversationsRefresh, useStore } from "../lib/store";
import { LangSwitch } from "./LangSwitch";
import { BoxIcon, ChatIcon, GearIcon, LogoutIcon, OrdersIcon, SparkIcon } from "./icons";
import type { ReactNode } from "react";

const NAV: { to: string; key: TKey; icon: ReactNode }[] = [
  { to: "/inbox", key: "nav.inbox", icon: <ChatIcon /> },
  { to: "/orders", key: "nav.orders", icon: <OrdersIcon /> },
  { to: "/catalog", key: "nav.catalog", icon: <BoxIcon /> },
  { to: "/assistant", key: "nav.assistant", icon: <SparkIcon /> },
  { to: "/settings", key: "nav.settings", icon: <GearIcon /> },
];

// Pause / resume the assistant. Flips the UI at once and reverts if the write fails.
function PauseSwitch() {
  const { t } = useI18n();
  const { store, patchStore } = useStore();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!store) return null;
  const on = store.agent_enabled;
  const storeId = store.id;

  async function toggle() {
    if (busy) return;
    const next = !on;
    setBusy(true); setFailed(false);
    patchStore({ agent_enabled: next });
    const { error } = await supabase.from("stores").update({ agent_enabled: next }).eq("id", storeId);
    setBusy(false);
    if (error) { patchStore({ agent_enabled: on }); setFailed(true); }
  }

  return (
    <div className="flex flex-col items-start gap-1 min-w-0">
      <button type="button" data-testid="agent-toggle" onClick={() => void toggle()} disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap border disabled:opacity-60"
        style={{
          borderColor: on ? "var(--brand)" : "var(--warn-text)",
          background: on ? "transparent" : "var(--warn-bg)",
          color: on ? "var(--brand)" : "var(--warn-text)",
        }}>
        <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full" style={{ background: on ? "var(--brand)" : "var(--warn-text)" }} />
        {on ? t("agent.on") : t("agent.paused")}
      </button>
      {failed && <span role="alert" className="error text-xs">{t("agent.failed")}</span>}
    </div>
  );
}

function NeedsBadge({ count, className }: { count: number; className: string }) {
  const { t } = useI18n();
  if (count <= 0) return null;
  return (
    <span data-testid="needs-badge" aria-label={`${t("inbox.needsYou")}: ${count}`}
      className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none ${className}`}
      style={{ background: "var(--warn-text)", color: "#fff" }}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Layout() {
  const { t } = useI18n();
  const { store } = useStore();
  const storeId = store?.id;
  const [needs, setNeeds] = useState(0);

  // Chats that are waiting for the owner. Test chats (playground channel) are not customers.
  const loadNeeds = useCallback(async () => {
    if (!storeId) return;
    const { data, error } = await supabase.from("conversations")
      .select("id,channels(platform)").eq("store_id", storeId).eq("status", "human").limit(500);
    if (error || !data) return;
    const rows = data as unknown as { channels: { platform: string } | null }[];
    setNeeds(rows.filter((r) => r.channels?.platform !== "playground").length);
  }, [storeId]);

  useEffect(() => { void loadNeeds(); }, [loadNeeds]);
  useConversationsRefresh(storeId, loadNeeds);

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:w-60 md:flex-col md:gap-1 p-4 border-e divider" style={{ background: "var(--surface)" }}>
        <div className="px-2 py-3">
          <div className="font-extrabold text-lg">{t("app.name")}</div>
          <div className="muted text-sm truncate">{store?.name}</div>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to}
            className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold ${isActive ? "text-white" : ""}`}
            style={({ isActive }) => (isActive ? { background: "var(--brand)" } : undefined)}>
            {n.icon}<span className="min-w-0 flex-1 truncate">{t(n.key)}</span>
            {n.to === "/inbox" && <NeedsBadge count={needs} className="shrink-0" />}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-3">
          <PauseSwitch />
          <LangSwitch />
          <button className="btn" onClick={() => void supabase.auth.signOut()}>{t("auth.signOut")}</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between gap-2 px-4 py-3 border-b divider" style={{ background: "var(--surface)" }}>
          <div className="min-w-0">
            <div className="font-extrabold leading-tight">{t("app.name")}</div>
            <div className="muted text-xs truncate">{store?.name}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PauseSwitch />
            <LangSwitch />
            <button className="btn btn-icon" aria-label={t("auth.signOut")} title={t("auth.signOut")}
              onClick={() => void supabase.auth.signOut()}><LogoutIcon /></button>
          </div>
        </header>
        <main className="mx-auto max-w-4xl p-4 pb-28 md:pb-8"><Outlet /></main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 grid grid-cols-5 border-t divider safe-bottom" style={{ background: "var(--surface)" }}>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to}
            className="flex flex-col items-center gap-0.5 py-2 px-0.5 min-w-0 text-[10.5px] leading-tight font-semibold"
            style={({ isActive }) => ({ color: isActive ? "var(--brand)" : "var(--muted)" })}>
            <span className="relative">
              {n.icon}
              {n.to === "/inbox" && <NeedsBadge count={needs} className="absolute -top-1.5 -end-2.5" />}
            </span>
            <span className="max-w-full truncate">{t(n.key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
