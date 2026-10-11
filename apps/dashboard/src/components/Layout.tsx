import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { Avatar, Button, Switch, Toast } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useConversationsRefresh, useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { LangSwitch } from "./LangSwitch";
import { BoxIcon, ChatIcon, GearIcon, InsightsIcon, LogoutIcon, OrdersIcon, SparkIcon } from "./icons";

const NAV: { to: string; key: TKey; icon: ReactNode }[] = [
  { to: "/inbox", key: "nav.inbox", icon: <ChatIcon /> },
  { to: "/orders", key: "nav.orders", icon: <OrdersIcon /> },
  { to: "/catalog", key: "nav.catalog", icon: <BoxIcon /> },
  { to: "/assistant", key: "nav.assistant", icon: <SparkIcon /> },
  { to: "/settings", key: "nav.settings", icon: <GearIcon /> },
  { to: "/insights", key: "nav.insights", icon: <InsightsIcon /> },
];

// Pause / resume the assistant. The switch flips at once and reverts if the write fails.
function PauseSwitch({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { store, patchStore } = useStore();
  const [failed, setFailed] = useState(false);
  if (!store) return null;
  const on = store.agent_enabled;
  const storeId = store.id;

  async function toggle(next: boolean) {
    // Not blocked while a write is pending: the switch shows the latest choice and the last write wins.
    setFailed(false);
    patchStore({ agent_enabled: next });
    const { error } = await supabase.from("stores").update({ agent_enabled: next }).eq("id", storeId);
    if (error) { patchStore({ agent_enabled: on }); setFailed(true); }
  }

  return (
    <div className="flex flex-col items-start gap-1 min-w-0">
      <Switch
        isSelected={on}
        onChange={(next) => void toggle(next)}
        size={compact ? "sm" : "md"}
        data-testid="agent-toggle"
        className={`relative items-center rounded-full border-2 border-ink bg-slip text-sm font-semibold text-ink shadow-ink-sm data-[selected=true]:bg-blue data-[selected=true]:text-slip ${compact ? "min-h-9 w-36 text-xs" : "min-h-11 min-w-40"}`}
      >
        <Switch.Control className="ms-1.5">
          <Switch.Thumb />
        </Switch.Control>
        {/* The label fills the whole pill so a click anywhere on it toggles the switch. */}
        <Switch.Content className={`absolute inset-0 flex cursor-pointer items-center text-start [color:inherit] ${compact ? "ps-9 pe-2" : "ps-12 pe-3"}`}>{on ? t("agent.on") : t("agent.paused")}</Switch.Content>
      </Switch>
      <AnimatePresence>
        {failed && (
          <m.span key="failed" role="alert" className="text-xs font-semibold text-red"
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: dur.short, ease: ease.out }}>
            {t("agent.failed")}
          </m.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// Unread count. Pops whenever the number changes.
function NeedsBadge({ count, className }: { count: number; className: string }) {
  const { t } = useI18n();
  const reduced = useMotionSafe();
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <m.span key={label} data-testid="needs-badge" aria-label={`${t("inbox.needsYou")}: ${count}`}
        className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full border-2 border-ink bg-red text-[11px] font-bold leading-none text-slip ${className}`}
        initial={reduced ? false : { scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
        transition={{ duration: dur.short, ease: ease.stamp }}>
        {label}
      </m.span>
    </AnimatePresence>
  );
}

// Store avatar: the first letter of the store name.
function StoreAvatar({ name, size = "md" }: { name?: string; size?: "sm" | "md" }) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase();
  return (
    <Avatar size={size} className="shrink-0 border-2 border-ink bg-blue text-slip">
      <Avatar.Fallback className="bg-blue font-bold text-slip">{initial}</Avatar.Fallback>
    </Avatar>
  );
}

// Shared nav item look. The active pill is one element that slides between items (shared layout).
function navClass(isActive: boolean, extra = "") {
  return `relative isolate flex items-center gap-3 rounded-wakil px-3 font-semibold text-[15px] no-underline transition-colors duration-150 ${isActive ? "text-slip" : "text-ink hover:bg-ink/5"} ${extra}`;
}

function ActivePill() {
  return <m.span layoutId="nav-active" aria-hidden="true" className="absolute inset-0 -z-10 rounded-wakil bg-ink shadow-ink-sm"
    transition={{ type: "spring", stiffness: 500, damping: 40 }} />;
}

export function Layout() {
  const { t } = useI18n();
  const { store } = useStore();
  const storeId = store?.id;
  const location = useLocation();
  const reduced = useMotionSafe();
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

  const signOut = () => void supabase.auth.signOut();
  // Each top-level section fades in as the route changes. The inbox handles its own list-to-chat motion.
  const section = location.pathname.split("/")[1] ?? "";

  return (
    <LazyMotion features={domAnimation}>
      <Toast.Provider placement="bottom end" />
      <div className="min-h-dvh overflow-x-clip bg-paper text-ink lg:flex">
        {/* Desktop sidebar (>= 1024px) */}
        <aside className="sticky top-4 m-4 hidden h-[calc(100dvh-2rem)] w-64 shrink-0 flex-col gap-1 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink lg:flex">
          <div className="flex min-w-0 items-center gap-3 px-1 py-2">
            <StoreAvatar name={store?.name} />
            <div className="min-w-0">
              <div className="truncate font-bold text-ink">{store?.name}</div>
              <div className="truncate text-xs text-soft">{t("app.name")}</div>
            </div>
          </div>
          {/* A div, not a nav: the phone bottom bar is the only <nav> the mobile layout exposes. */}
          <div role="navigation" className="mt-3 flex flex-col gap-1" aria-label={t("app.name")}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => navClass(isActive, "min-h-11")}>
                {({ isActive }) => (
                  <>
                    {isActive && <ActivePill />}
                    <span className="inline-flex shrink-0 [&>svg]:size-5">{n.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{t(n.key)}</span>
                    {n.to === "/inbox" && <NeedsBadge count={needs} className="shrink-0" />}
                  </>
                )}
              </NavLink>
            ))}
          </div>
          <div className="mt-auto flex flex-col items-start gap-3 border-t border-ink/15 pt-4">
            <PauseSwitch />
            <LangSwitch />
            <Button variant="ghost" size="sm" className="font-semibold text-red" onPress={signOut}>
              {t("auth.signOut")}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Phone header (< 1024px) */}
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b-2 border-ink bg-slip px-4 py-2 lg:hidden">
            <div className="flex min-w-0 items-center gap-2.5">
              <StoreAvatar name={store?.name} size="sm" />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold leading-tight text-ink">{store?.name}</div>
                <div className="truncate text-xs text-soft">{t("app.name")}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <PauseSwitch compact />
              <LangSwitch />
              <Button isIconOnly variant="ghost" size="sm" aria-label={t("auth.signOut")} onPress={signOut}>
                <LogoutIcon />
              </Button>
            </div>
          </header>

          <main className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-8">
            <m.div key={section} className="min-w-0"
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: dur.short, ease: ease.out }}>
              <Outlet />
            </m.div>
          </main>
        </div>

        {/* Phone bottom tab bar (< 1024px) */}
        <nav aria-label={t("app.name")} className="pb-[env(safe-area-inset-bottom)] fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t-2 border-ink bg-slip lg:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to}
              className={({ isActive }) => `relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0 py-1.5 text-[10px] leading-tight no-underline transition-colors duration-150 ${isActive ? "font-bold text-blue" : "font-medium text-soft"}`}>
              {({ isActive }) => (
                <>
                  {isActive && <m.span layoutId="tab-active" aria-hidden="true" className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-red"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <span className="relative block h-6 w-6 [&>svg]:size-6">
                    {n.icon}
                    {n.to === "/inbox" && <NeedsBadge count={needs} className="absolute -top-1.5 -end-2.5" />}
                  </span>
                  <span className="max-w-full truncate">{t(n.key)}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </LazyMotion>
  );
}
