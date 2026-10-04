import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { LangSwitch } from "./LangSwitch";
import { BoxIcon, ChatIcon, GearIcon, LogoutIcon, PlugIcon } from "./icons";
import type { ReactNode } from "react";

const NAV: { to: string; key: TKey; icon: ReactNode }[] = [
  { to: "/inbox", key: "nav.inbox", icon: <ChatIcon /> },
  { to: "/catalog", key: "nav.catalog", icon: <BoxIcon /> },
  { to: "/channels", key: "nav.channels", icon: <PlugIcon /> },
  { to: "/settings", key: "nav.settings", icon: <GearIcon /> },
];

export function Layout() {
  const { t } = useI18n();
  const { store } = useStore();

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
            {n.icon}{t(n.key)}
          </NavLink>
        ))}
        <div className="mt-auto flex flex-col gap-2">
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
          <div className="flex items-center gap-2">
            <LangSwitch />
            <button className="btn btn-icon" aria-label={t("auth.signOut")} title={t("auth.signOut")}
              onClick={() => void supabase.auth.signOut()}><LogoutIcon /></button>
          </div>
        </header>
        <main className="mx-auto max-w-4xl p-4 pb-28 md:pb-8"><Outlet /></main>
      </div>

      <nav className="md:hidden fixed bottom-0 inset-x-0 grid grid-cols-4 border-t divider safe-bottom" style={{ background: "var(--surface)" }}>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to}
            className="flex flex-col items-center gap-0.5 py-2 text-xs font-semibold"
            style={({ isActive }) => ({ color: isActive ? "var(--brand)" : "var(--muted)" })}>
            {n.icon}{t(n.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
