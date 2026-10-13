import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useMatch } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Alert, Avatar, Button, Card, Chip, Input, Skeleton, Tabs } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { formatTime } from "../lib/format";
import { countConversations, fetchInboxRows, INBOX_PAGE } from "../lib/inbox";
import type { InboxCursor, InboxRow, InboxStatus } from "../lib/inbox";
import { useConversationsRefresh, useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { SetupChecklist } from "../components/SetupChecklist";

type Status = InboxStatus;
type Conv = InboxRow;
type Page = { rows: Conv[]; hasMore: boolean };
type Counts = Record<Status, number>;

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

function ChatRow({ c, active, showStatus, entry }: { c: Conv; active: boolean; showStatus: boolean; entry: Entry }) {
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const name = c.customer_name || c.platform_user_id || t("inbox.customer");
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
          {/* A photo the assistant sent has no body: say so instead of "No messages". */}
          <span className="block truncate text-[13px] text-soft">{c.last_body ?? t(c.last_direction === "outbound" ? "inbox.photoSent" : "inbox.noMessages")}</span>
          {c.status === "human" && c.handoff_reason && (
            <span className="mt-0.5 block truncate text-[13px] font-semibold text-red">{c.handoff_reason}</span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-soft" dir="ltr">{formatTime(c.last_message_at ?? c.last_customer_message_at, lang)}</span>
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

// Older chats, one page at a time.
function LoadMore({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-center p-2">
      <Button size="sm" variant="outline" isDisabled={busy} onPress={onPress}>{t("inbox.loadMore")}</Button>
    </div>
  );
}

// The ids already on screen, plus these. Kept across tab switches so a chat that comes back does not re-highlight.
function addIds(seen: Set<string> | null, ids: string[]): Set<string> {
  return new Set([...(seen ?? []), ...ids]);
}

export function Inbox() {
  const { t, lang } = useI18n();
  const { store } = useStore();
  const storeId = store?.id;
  const reduced = useMotionSafe();
  const match = useMatch("/inbox/:id");
  const open = match !== null;
  const activeId = match?.params.id;
  const [tab, setTab] = useState<Status>("human");
  const [query, setQuery] = useState("");
  // The search term, 300 ms after the owner stops typing.
  const [term, setTerm] = useState("");
  // The chats in the list: the current tab, or every status while searching.
  const [list, setList] = useState<Page | null>(null);
  // Chats waiting for the owner, shown above the tabs when another tab is open (first page only).
  const [waiting, setWaiting] = useState<Page | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [aiProblems, setAiProblems] = useState(0);
  // Each load gets a number; only the newest one may write the screen (stale replies are dropped).
  const seqRef = useRef(0);
  const listRef = useRef<Page | null>(null);
  // Ids already on screen. null until the first list arrives, so the first load can stagger.
  const seenRef = useRef<Set<string> | null>(null);
  const seenSnapshot = seenRef.current;
  const searching = term !== "";
  const listStatus: Status | null = searching ? null : tab;
  const humanOnTab = tab === "human" && !searching;

  useEffect(() => {
    const id = window.setTimeout(() => setTerm(query.trim()), 300);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => { listRef.current = list; }, [list]);

  // Reloads the screen. A reset starts over at one page. A refresh (realtime or polling) re-reads as many
  // rows as are already loaded, so the owner's place in a long list survives.
  const load = useCallback(async (reset: boolean) => {
    if (!storeId) return;
    const seq = ++seqRef.current;
    const want = reset ? INBOX_PAGE : Math.max(INBOX_PAGE, listRef.current?.rows.length ?? 0);
    if (reset) setList(null);
    const sameTab = !searching && tab !== "human";
    const aiProblemsSince = new Date(Date.now() - 86_400_000).toISOString();
    try {
      const [page, box, cnt, ai] = await Promise.all([
        fetchInboxRows(storeId, listStatus, term, want, null),
        sameTab ? fetchInboxRows(storeId, "human", "", INBOX_PAGE, null) : Promise.resolve(null),
        Promise.all(TABS.map((x) => countConversations(storeId, x.status))),
        // Messages the assistant could not answer (model outage) in the last day.
        supabase.from("agent_runs").select("id", { count: "exact", head: true })
          .eq("source", "customer").not("error", "is", null).gte("created_at", aiProblemsSince),
      ]);
      if (seq !== seqRef.current) return;
      if (reset && seenRef.current) seenRef.current = addIds(seenRef.current, page.rows.map((r) => r.id));
      setList(page);
      setWaiting(box);
      setCounts({ human: cnt[0] ?? 0, bot: cnt[1] ?? 0, closed: cnt[2] ?? 0 });
      setAiProblems(ai.count ?? 0);
      setFailed(false);
    } catch {
      if (seq === seqRef.current) setFailed(true);
    }
  }, [storeId, tab, term, searching, listStatus]);

  // The first load, and a fresh load whenever the tab or the search changes.
  useEffect(() => { void load(true); }, [load]);
  // Refreshes on realtime changes to this store's chats; polls every 60 s (15 s if realtime is down).
  const refresh = useCallback(() => { void load(false); }, [load]);
  useConversationsRefresh(storeId, refresh);

  // Remember what has been shown, after each render, so the next render can tell new rows apart.
  useEffect(() => {
    if (list) seenRef.current = addIds(seenRef.current, [...list.rows, ...(waiting?.rows ?? [])].map((c) => c.id));
  }, [list, waiting]);

  async function loadMore() {
    const cur = listRef.current;
    const last = cur?.rows[cur.rows.length - 1];
    if (!storeId || !cur?.hasMore || !last || moreBusy) return;
    const seq = seqRef.current;
    setMoreBusy(true);
    try {
      const cursor: InboxCursor = { at: last.last_customer_message_at, id: last.id };
      const next = await fetchInboxRows(storeId, listStatus, term, INBOX_PAGE, cursor);
      if (seq === seqRef.current) {
        setList((prev) => prev && {
          hasMore: next.hasMore,
          rows: [...prev.rows, ...next.rows.filter((r) => !prev.rows.some((p) => p.id === r.id))],
        });
      }
    } catch {
      setFailed(true);
    } finally {
      setMoreBusy(false);
    }
  }

  const entryFor = (id: string, index: number): Entry => {
    if (reduced) return { kind: "none" };
    if (seenSnapshot === null) return { kind: "stagger", index };
    return seenSnapshot.has(id) ? { kind: "none" } : { kind: "new" };
  };

  const counted = (s: Status) => (counts ? ` (${counts[s]})` : "");
  const shown = list?.rows ?? [];
  const boxPage = humanOnTab ? list : searching ? null : waiting;
  const boxRows = boxPage?.rows ?? [];
  const current = TABS.find((x) => x.status === tab)!;
  const showEmpty = list !== null && shown.length === 0;
  const emptyKey: TKey = searching ? "inbox.noResults" : tab === "human" ? "inbox.emptyNeeds" : current.empty;
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
                <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void load(true)}>{t("common.retry")}</button>
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {!list && !failed && <ListSkeleton />}

        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t("inbox.search")} aria-label={t("inbox.search")} className="w-full" />

        {boxRows.length > 0 && (
          <Card className="overflow-hidden rounded-wakil-lg border-2 border-ink bg-slip p-0 shadow-ink">
            <div className="flex h-11 items-center justify-between gap-2 border-b-2 border-ink bg-red/10 px-4">
              <div className="flex items-center gap-2">
                <PulseDot />
                <h2 className="m-0 text-sm font-bold text-red">{t("inbox.needsYou")}</h2>
              </div>
              <span className="whitespace-nowrap text-[13px] font-semibold text-red">{t("inbox.waitingCount", { n: counts?.human ?? boxRows.length })}</span>
            </div>
            <div className="flex flex-col p-1.5">
              <AnimatePresence initial={false}>
                {boxRows.map((c, i) => (
                  <ChatRow key={c.id} c={c} active={activeId === c.id} showStatus={false} entry={entryFor(c.id, i)} />
                ))}
              </AnimatePresence>
            </div>
            {humanOnTab && boxPage?.hasMore && <LoadMore busy={moreBusy} onPress={() => void loadMore()} />}
          </Card>
        )}

        {!searching && (
          <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as Status)} className="w-full">
            <Tabs.ListContainer>
              <Tabs.List aria-label={t("inbox.title")} className="flex-wrap">
                {TABS.map((x) => (
                  <Tabs.Tab key={x.status} id={x.status} className="font-semibold">
                    {t(x.key)}{counted(x.status)}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        )}

        {showEmpty && !(humanOnTab && boxRows.length > 0) && (
          <Card className="rounded-wakil-lg border-2 border-dashed border-ink/25 bg-transparent p-5 text-soft shadow-none">
            {t(emptyKey)}
          </Card>
        )}

        {!humanOnTab && shown.length > 0 && (
          <Card className="overflow-hidden rounded-wakil-lg border-2 border-ink bg-slip p-1.5 shadow-ink">
            <AnimatePresence initial={false}>
              {shown.map((c, i) => (
                <ChatRow key={c.id} c={c} active={activeId === c.id} showStatus entry={entryFor(c.id, i)} />
              ))}
            </AnimatePresence>
            {list?.hasMore && <LoadMore busy={moreBusy} onPress={() => void loadMore()} />}
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
