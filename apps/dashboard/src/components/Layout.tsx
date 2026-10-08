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
      <button type="button" role="switch" aria-checked={on} data-testid="agent-toggle" onClick={() => void toggle()} disabled={busy}
        className="inline-flex items-center gap-2 ps-2 pe-3.5 rounded-full border text-sm font-semibold whitespace-nowrap disabled:opacity-60"
        style={{
          minHeight: 44,
          borderColor: on ? "var(--brand-border)" : "var(--border)",
          background: on ? "var(--brand-soft)" : "var(--surface)",
          color: on ? "var(--brand)" : "var(--muted)",
        }}>
        <span aria-hidden="true" className="relative inline-block shrink-0 rounded-full"
          style={{ width: 36, height: 20, background: on ? "var(--brand)" : "var(--border)" }}>
          <span className="absolute top-0.5 rounded-full transition-all"
            style={{
              width: 16, height: 16, background: "var(--surface)",
              insetInlineStart: on ? "auto" : 2, insetInlineEnd: on ? 2 : "auto",
            }} />
        </span>
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
      style={{ background: "var(--brand)", color: "var(--brand-contrast)" }}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Round store avatar: the first letter of the store name.
function StoreAvatar({ name, size }: { name?: string; size: number }) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase();
  return (
    <div aria-hidden="true" className="shrink-0 grid place-items-center rounded-full font-semibold"
      style={{ width: size, height: size, background: "var(--brand)", color: "var(--brand-contrast)", fontSize: size >= 40 ? 16 : 14 }}>
      {initial}
    </div>
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
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar (>= 1024px) */}
      <aside className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:gap-1 lg:sticky lg:top-0 lg:h-screen p-4 border-e divider" style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-3 px-2 py-3 min-w-0">
          <StoreAvatar name={store?.name} size={40} />
          <div className="min-w-0">
            <div className="font-semibold truncate" style={{ color: "var(--heading)" }}>{store?.name}</div>
            <div className="muted text-xs truncate">{t("app.name")}</div>
          </div>
        </div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to}
            className="flex items-center gap-3 rounded-xl px-3 font-semibold text-[15px]"
            style={({ isActive }) => ({
              minHeight: 44,
              background: isActive ? "var(--brand-soft)" : undefined,
              color: isActive ? "var(--brand)" : "var(--heading)",
            })}>
            {n.icon}<span className="min-w-0 flex-1 truncate">{t(n.key)}</span>
            {n.to === "/inbox" && <NeedsBadge count={needs} className="shrink-0" />}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col items-start gap-3 pt-4">
          <PauseSwitch />
          <LangSwitch />
          <button className="btn btn-small" onClick={() => void supabase.auth.signOut()}>{t("auth.signOut")}</button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Phone header (< 1024px) */}
        <header className="lg:hidden flex items-center justify-between gap-2 px-4 border-b divider" style={{ background: "var(--surface)", minHeight: 64 }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <StoreAvatar name={store?.name} size={40} />
            <div className="min-w-0">
              <div className="font-semibold leading-tight truncate" style={{ color: "var(--heading)" }}>{store?.name}</div>
              <div className="muted text-xs truncate">{t("app.name")}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PauseSwitch />
            <LangSwitch />
            <button className="btn btn-icon" aria-label={t("auth.signOut")} title={t("auth.signOut")}
              onClick={() => void supabase.auth.signOut()}><LogoutIcon /></button>
          </div>
        </header>
        <main className="mx-auto max-w-4xl p-4 pb-28 lg:pb-8"><Outlet /></main>
      </div>

      {/* Phone bottom tab bar (< 1024px) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 grid grid-cols-5 border-t divider safe-bottom" style={{ background: "var(--surface)" }}>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to}
            className="flex flex-col items-center justify-center gap-1 py-1.5 px-0.5 min-w-0 text-xs leading-tight"
            style={({ isActive }) => ({
              minHeight: 56,
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--brand)" : "var(--muted)",
            })}>
            <span className="relative block w-6 h-6">
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
