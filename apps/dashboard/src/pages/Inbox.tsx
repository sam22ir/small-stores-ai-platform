import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useMatch } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Alert, Avatar, Card, Chip, Skeleton, Tabs } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { formatTime } from "../lib/format";
import { useConversationsRefresh, useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
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
    <div className="hidden min-h-[60vh] flex-1 items-center justify-center rounded-wakil-lg border-2 border-dashed border-ink/25 p-6 text-center text-soft lg:flex">
      {t("inbox.selectConversation")}
    </div>
  );
}

// Loading state: skeleton rows that shimmer until the first list arrives.
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-wakil border-2 border-ink/10 bg-slip p-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5 rounded-full" />
            <Skeleton className="h-3 w-4/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// A chat row. Rows present on the first load stagger in; a row that arrives later slides in
// at the top with a short highlight; rows that re-mount (tab switch) appear without motion.
type Entry = { kind: "none" } | { kind: "stagger"; index: number } | { kind: "new" };

function ChatRow({ c, preview, active, showStatus, entry }: { c: Conv; preview?: Preview; active: boolean; showStatus: boolean; entry: Entry }) {
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const name = c.customers?.display_name || c.customers?.platform_user_id || t("inbox.customer");
  const initial = name.trim().charAt(0).toUpperCase();
  const isNew = entry.kind === "new";
  const animate = !reduced && entry.kind !== "none";
  const delay = entry.kind === "stagger" ? Math.min(entry.index * 0.045, 0.35) : 0;
  const chipColor = c.status === "human" ? "warning" : c.status === "bot" ? "accent" : "default";
  return (
    <m.div
      initial={animate ? { opacity: 0, y: isNew ? -14 : 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out, delay }}
      className="relative"
    >
      {isNew && (
        <m.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-wakil bg-blue/15"
          initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 1.6, ease: ease.out }} />
      )}
      <Link to={`/inbox/${c.id}`} aria-current={active ? "page" : undefined}
        className={`relative flex min-h-14 items-center gap-3 rounded-wakil px-3 py-2.5 no-underline text-ink transition-colors duration-150 hover:bg-ink/5 ${active ? "bg-blue/10" : ""}`}>
        <m.span layoutId={`avatar-${c.id}`} className="inline-flex shrink-0">
          <Avatar size="sm" className="border-2 border-ink bg-slip text-ink" aria-hidden="true">
            <Avatar.Fallback className="bg-slip font-semibold text-ink">{initial}</Avatar.Fallback>
          </Avatar>
        </m.span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{name}</span>
          <span className="block truncate text-[13px] text-soft">{preview?.body ?? t("inbox.noMessages")}</span>
          {c.status === "human" && c.handoff_reason && (
            <span className="mt-0.5 block truncate text-[13px] font-semibold text-red">{c.handoff_reason}</span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-soft" dir="ltr">{formatTime(preview?.created_at ?? c.last_customer_message_at, lang)}</span>
          {showStatus && (
            <Chip size="sm" color={chipColor} variant="soft" className="whitespace-nowrap">
              <Chip.Label>{t(c.status === "human" ? "inbox.needsYou" : c.status === "bot" ? "inbox.assistant" : "inbox.closed")}</Chip.Label>
            </Chip>
          )}
        </span>
      </Link>
    </m.div>
  );
}

// Pulsing dot that marks the "Needs you" box as waiting. Only transform and opacity animate.
function PulseDot() {
  const reduced = useMotionSafe();
  return (
    <m.span aria-hidden="true" className="inline-block size-2 rounded-full bg-red"
      animate={reduced ? undefined : { scale: [1, 1.6, 1], opacity: [1, 0.45, 1] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
  );
}

export function Inbox() {
  const { t, lang } = useI18n();
  const { store } = useStore();
  const reduced = useMotionSafe();
  const match = useMatch("/inbox/:id");
  const open = match !== null;
  const activeId = match?.params.id;
  const [tab, setTab] = useState<Status>("human");
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [failed, setFailed] = useState(false);
  const [aiProblems, setAiProblems] = useState(0);
  // Ids already on screen. null until the first list arrives, so the first load can stagger.
  const seenRef = useRef<Set<string> | null>(null);
  const seenSnapshot = seenRef.current;

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

  // Remember what has been shown, after each render, so the next render can tell new rows apart.
  useEffect(() => {
    if (convs) seenRef.current = new Set(convs.map((c) => c.id));
  }, [convs]);

  const entryFor = (id: string, index: number): Entry => {
    if (reduced) return { kind: "none" };
    if (seenSnapshot === null) return { kind: "stagger", index };
    return seenSnapshot.has(id) ? { kind: "none" } : { kind: "new" };
  };

  const counts = (s: Status) => (convs ?? []).filter((c) => c.status === s).length;
  const human = (convs ?? []).filter((c) => c.status === "human");
  // The "Needs you" box already lists those chats, so the Needs-you tab shows the box alone.
  const listRows = tab === "human" ? [] : (convs ?? []).filter((c) => c.status === tab);
  const current = TABS.find((x) => x.status === tab)!;
  const showEmpty = convs !== null && (tab === "human" ? human.length === 0 : listRows.length === 0);
  const contentKey = activeId ?? "none";
  const slide = lang === "ar" ? -1 : 1;

  return (
    <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
      <section aria-label={t("inbox.title")}
        className={`${open ? "hidden lg:flex" : "flex"} min-w-0 flex-col gap-3 lg:sticky lg:top-8 lg:w-[380px] lg:shrink-0`}>
        <h1 className="mb-1 mt-1 text-2xl font-extrabold text-ink">{t("inbox.title")}</h1>
        <SetupChecklist />

        {aiProblems > 0 && (
          <Alert status="warning" className="border-2 border-ink">
            <Alert.Content>
              <Alert.Description role="status">{t("inbox.aiProblem", { n: aiProblems })}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {failed && (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Description>
                {t("common.error")}{" "}
                <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void load()}>{t("common.retry")}</button>
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {!convs && !failed && <ListSkeleton />}

        {human.length > 0 && (
          <Card className="overflow-hidden rounded-wakil-lg border-2 border-ink bg-slip p-0 shadow-ink">
            <div className="flex h-11 items-center justify-between gap-2 border-b-2 border-ink bg-red/10 px-4">
              <div className="flex items-center gap-2">
                <PulseDot />
                <h2 className="m-0 text-sm font-bold text-red">{t("inbox.needsYou")}</h2>
              </div>
              <span className="whitespace-nowrap text-[13px] font-semibold text-red">{t("inbox.waitingCount", { n: human.length })}</span>
            </div>
            <div className="flex flex-col p-1.5">
              <AnimatePresence initial={false}>
                {human.map((c, i) => (
                  <ChatRow key={c.id} c={c} preview={previews[c.id]} active={activeId === c.id} showStatus={false} entry={entryFor(c.id, i)} />
                ))}
              </AnimatePresence>
            </div>
          </Card>
        )}

        <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as Status)} className="w-full">
          <Tabs.ListContainer>
            <Tabs.List aria-label={t("inbox.title")} className="flex-wrap">
              {TABS.map((x) => (
                <Tabs.Tab key={x.status} id={x.status} className="font-semibold">
                  {t(x.key)}{convs ? ` (${counts(x.status)})` : ""}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        {showEmpty && (
          <Card className="rounded-wakil-lg border-2 border-dashed border-ink/25 bg-transparent p-5 text-soft shadow-none">
            {t(tab === "human" ? "inbox.emptyNeeds" : current.empty)}
          </Card>
        )}

        {listRows.length > 0 && (
          <Card className="overflow-hidden rounded-wakil-lg border-2 border-ink bg-slip p-1.5 shadow-ink">
            <AnimatePresence initial={false}>
              {listRows.map((c, i) => (
                <ChatRow key={c.id} c={c} preview={previews[c.id]} active={activeId === c.id} showStatus entry={entryFor(c.id, i)} />
              ))}
            </AnimatePresence>
          </Card>
        )}
      </section>

      <div className={`${open ? "flex" : "hidden lg:flex"} min-w-0 flex-1 flex-col`}>
        {/* Opening a chat slides it in from the end side; on wide screens it fades beside the list. */}
        <m.div key={contentKey} className="flex min-w-0 flex-1 flex-col"
          initial={reduced || !open ? false : { opacity: 0, x: 24 * slide }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: dur.short, ease: ease.out }}>
          <Outlet />
        </m.div>
      </div>
    </div>
  );
}
