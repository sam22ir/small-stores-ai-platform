import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { Avatar, Button, Switch, Toast } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { countConversations } from "../lib/inbox";
import { useConversationsRefresh, useStore } from "../lib/store";
import { useHandoffAlerts } from "../lib/useHandoffAlerts";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { LangSwitch } from "./LangSwitch";
import { BoxIcon, ChatIcon, GearIcon, InsightsIcon, MoreIcon, OrdersIcon, SparkIcon } from "./icons";

// One list drives the desktop sidebar, the phone bottom bar and the phone "More" sheet.
// group: the sidebar divider sits where the group changes. tab: shown in the phone bottom bar; the rest live in "More".
const NAV: { to: string; key: TKey; icon: ReactNode; group: "daily" | "config"; tab: boolean }[] = [
  { to: "/inbox", key: "nav.inbox", icon: <ChatIcon />, group: "daily", tab: true },
  { to: "/orders", key: "nav.orders", icon: <OrdersIcon />, group: "daily", tab: true },
  { to: "/catalog", key: "nav.catalog", icon: <BoxIcon />, group: "daily", tab: true },
  { to: "/insights", key: "nav.insights", icon: <InsightsIcon />, group: "daily", tab: false },
  { to: "/assistant", key: "nav.assistant", icon: <SparkIcon />, group: "config", tab: false },
  { to: "/settings", key: "nav.settings", icon: <GearIcon />, group: "config", tab: false },
];
const TAB_ITEMS = NAV.filter((n) => n.tab);
const MORE_ITEMS = NAV.filter((n) => !n.tab);

// Pause / resume the assistant. The switch flips at once and reverts if the write fails.
function PauseSwitch({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { store, patchStore } = useStore();
  const [failed, setFailed] = useState(false);
  const labelId = useId();
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
        aria-labelledby={labelId}
        className={`relative flex items-center justify-start rounded-full border-2 border-ink bg-slip font-semibold text-ink shadow-ink-sm data-[selected=true]:bg-blue data-[selected=true]:text-slip ${compact ? "min-h-9 w-36 text-xs" : "min-h-11 min-w-44 text-sm"}`}
      >
        {/* The knob is pinned to the start edge; the label starts past it (see below), so they cannot overlap. */}
        <Switch.Control className="absolute start-1.5 top-1/2 -translate-y-1/2">
          <Switch.Thumb />
        </Switch.Control>
        {/* The label fills the whole pill so a click anywhere on it toggles the switch. Its padding starts past the knob, so the text never sits under it. */}
        <Switch.Content className={`absolute inset-0 flex min-w-0 cursor-pointer items-center text-start [color:inherit] ${compact ? "ps-11 pe-1" : "ps-14 pe-3"}`}><span id={labelId} className="truncate">{on ? t("agent.on") : t("agent.paused")}</span></Switch.Content>
      </Switch>
      {/* Desktop only: while paused, say what it costs the customer. Not shown in the cramped phone header. */}
      {!compact && !on && <span className="text-xs font-semibold text-amber">{t("agent.pausedHint")}</span>}
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
  // The "More" sheet is open for the navigation whose key is stored here. Every navigation gets a new key,
  // so the sheet closes on any route change (including back and forward) without an effect that sets state.
  const [moreKey, setMoreKey] = useState<string | null>(null);
  const moreOpen = moreKey === location.key;
  const moreActive = MORE_ITEMS.some((n) => location.pathname === n.to || location.pathname.startsWith(`${n.to}/`));
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMoreKey(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  // Chats that are waiting for the owner. Test chats (playground channel) are not customers.
  const loadNeeds = useCallback(async () => {
    if (!storeId) return;
    const n = await countConversations(storeId, "human");
    if (n !== null) setNeeds(n);
  }, [storeId]);

  useEffect(() => { void loadNeeds(); }, [loadNeeds]);
  useConversationsRefresh(storeId, loadNeeds);
  // Tab title count, and optional sound / browser notification for new handoffs.
  useHandoffAlerts(storeId);

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
          {/* The assistant on/off state sits at the top, right under the store, so it is always in view. */}
          <div className="mt-3">
            <PauseSwitch />
          </div>
          {/* A div, not a nav: the phone bottom bar is the only <nav> the mobile layout exposes. */}
          <div role="navigation" className="mt-3 flex flex-col gap-1" aria-label={t("app.name")}>
            {NAV.map((n, i) => (
              <Fragment key={n.to}>
                {i > 0 && NAV[i - 1].group !== n.group && <div role="presentation" className="my-2 border-t border-ink/15" />}
                <NavLink to={n.to} className={({ isActive }) => navClass(isActive, "min-h-11")}>
                  {({ isActive }) => (
                    <>
                      {isActive && <ActivePill />}
                      <span className="inline-flex shrink-0 [&>svg]:size-5">{n.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{t(n.key)}</span>
                      {n.to === "/inbox" && <NeedsBadge count={needs} className="shrink-0" />}
                    </>
                  )}
                </NavLink>
              </Fragment>
            ))}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-ink/15 pt-4">
            <LangSwitch />
            <Button variant="ghost" size="sm" className="font-semibold text-red" onPress={signOut}>
              {t("auth.signOut")}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Phone header (< 1024px). Language and sign-out live in Settings and the More sheet, so the store name keeps its room. */}
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b-2 border-ink bg-slip px-4 py-2 lg:hidden">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <StoreAvatar name={store?.name} size="sm" />
              <div className="min-w-24 flex-1">
                <div className="truncate text-[15px] font-bold leading-tight text-ink" data-testid="header-store-name">{store?.name}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              <PauseSwitch compact />
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

        {/* Phone bottom bar (< 1024px): three tabs plus More, which opens the sheet below. */}
        <nav aria-label={t("app.name")} className="pb-[env(safe-area-inset-bottom)] fixed inset-x-0 bottom-0 z-40 grid min-h-14 grid-cols-4 border-t-2 border-ink bg-slip lg:hidden">
          {TAB_ITEMS.map((n) => (
            // The link name is the label; the count is folded into the Chats name because the badge is aria-hidden.
            <NavLink key={n.to} to={n.to}
              aria-label={n.to === "/inbox" && needs > 0 ? `${t(n.key)}, ${t("inbox.needsYou")}: ${needs}` : t(n.key)}
              className={({ isActive }) => `relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[11px] leading-tight no-underline transition-colors duration-150 ${isActive ? "font-bold text-blue" : "font-medium text-soft"}`}>
              {({ isActive }) => (
                <>
                  {isActive && <m.span layoutId="tab-active" aria-hidden="true" className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-red"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <span aria-hidden="true" className="relative block h-6 w-6 [&>svg]:size-6">
                    {n.icon}
                    {n.to === "/inbox" && <NeedsBadge count={needs} className="absolute -top-1.5 -end-2.5" />}
                  </span>
                  {/* Labels wrap instead of truncating, so long Arabic names stay readable on 320px phones. */}
                  <span className="block max-w-full break-words text-center">{t(n.key)}</span>
                </>
              )}
            </NavLink>
          ))}
          <button type="button" data-testid="nav-more" aria-label={t("nav.more")} aria-haspopup="dialog" aria-expanded={moreOpen}
            onClick={() => setMoreKey(moreOpen ? null : location.key)}
            className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 text-[11px] leading-tight transition-colors duration-150 ${moreActive ? "font-bold text-blue" : "font-medium text-soft"}`}>
            {moreActive && <m.span layoutId="tab-active" aria-hidden="true" className="absolute inset-x-3 top-0 h-[3px] rounded-full bg-red"
              transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <span aria-hidden="true" className="relative block h-6 w-6 [&>svg]:size-6"><MoreIcon /></span>
            <span className="block max-w-full break-words text-center">{t("nav.more")}</span>
          </button>
        </nav>

        {/* "More" bottom sheet. Mounted only while open, so its links are not in the bar and are not announced when closed. */}
        <AnimatePresence>
          {moreOpen && (
            <m.div key="more-backdrop" aria-hidden="true" className="fixed inset-0 z-[45] bg-ink/40" onClick={() => setMoreKey(null)}
              initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: dur.short, ease: ease.out }} />
          )}
          {moreOpen && (
            <m.div key="more-sheet" ref={sheetRef} role="dialog" aria-modal="true" aria-label={t("nav.more")} tabIndex={-1} data-testid="more-sheet"
              className="pb-[calc(1rem+env(safe-area-inset-bottom))] fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-wakil-lg border-2 border-b-0 border-ink bg-slip px-4 pt-3 shadow-ink outline-none"
              initial={reduced ? false : { y: "100%" }} animate={{ y: 0 }} exit={reduced ? { opacity: 0 } : { y: "100%" }}
              transition={{ duration: dur.short, ease: ease.out }}>
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-ink/20" aria-hidden="true" />
              <div className="flex flex-col gap-1">
                {MORE_ITEMS.map((n) => (
                  <NavLink key={n.to} to={n.to} onClick={() => setMoreKey(null)}
                    className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-wakil px-3 text-base font-semibold no-underline transition-colors duration-150 ${isActive ? "bg-ink text-slip shadow-ink-sm" : "text-ink hover:bg-ink/5"}`}>
                    <span className="inline-flex shrink-0 [&>svg]:size-5">{n.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{t(n.key)}</span>
                  </NavLink>
                ))}
              </div>
              <div className="mt-3 flex flex-col items-start gap-3 border-t border-ink/15 pt-3">
                <LangSwitch />
                <Button variant="ghost" className="min-h-12 font-semibold text-red" onPress={signOut}>
                  {t("auth.signOut")}
                </Button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}
