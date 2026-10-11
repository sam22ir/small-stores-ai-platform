import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Alert, Avatar, Button, Chip, Skeleton, Spinner, TextArea } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { formatTime } from "../lib/format";
import { useRealtimeRefresh } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { platformKey } from "./Inbox";
import { FaqModal } from "../components/FaqModal";
import { SparkIcon } from "../components/icons";

type Conv = {
  id: string;
  store_id: string;
  channel_id: string;
  status: "human" | "bot" | "closed";
  handoff_reason: string | null;
  customers: { display_name: string | null; platform_user_id: string } | null;
  channels: { platform: string } | null;
};
// Canned replies the owner can drop into the box (filled, never sent automatically).
const QUICK_REPLIES: TKey[] = ["thread.quick.phone", "thread.quick.confirmed", "thread.quick.delivery", "thread.quick.thanks"];

type Msg = {
  id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "agent" | "owner";
  body: string | null;
  created_at: string;
  delivery_status: string | null;
  delivery_error: string | null;
};

// Messages per query. The newest page is shown first; "Load earlier" fetches the page before it.
const PAGE = 100;
// While a reply is waiting to go out, ask the server to send it this often.
const RETRY_MS = 8000;
const isPending = (msg: Msg) => msg.direction === "outbound" && msg.delivery_status === "pending";

// Oldest first, one entry per id. When both lists have a message, the later argument wins.
function mergeMsgs(a: Msg[], b: Msg[]): Msg[] {
  const byId = new Map<string, Msg>();
  for (const msg of [...a, ...b]) byId.set(msg.id, msg);
  return [...byId.values()].sort((x, y) =>
    x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
}

// Check mark that draws itself. Used after a reply is sent and after an answer is saved.
function Tick({ className = "" }: { className?: string }) {
  const reduced = useMotionSafe();
  return (
    <m.svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}
      initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: dur.short, ease: ease.stamp }}>
      <m.path d="M5 12.5l4.5 4.5L19 7.5" initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: dur.short, ease: ease.out, delay: 0.05 }} />
    </m.svg>
  );
}

// Placeholder shown while the first messages load: a header and a few bubbles.
function ThreadSkeleton() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[70dvh] min-w-0 flex-1 flex-col overflow-hidden rounded-wakil-lg border-2 border-ink bg-slip shadow-ink lg:min-h-[70vh]">
      <div className="flex items-center gap-3 border-b-2 border-ink px-3 py-3" aria-hidden="true">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-2/5 rounded-full" />
          <Skeleton className="h-3 w-1/5 rounded-full" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3 bg-paper/60 px-4 py-4" aria-hidden="true">
        <Skeleton className="h-12 w-3/5 rounded-wakil" />
        <Skeleton className="ms-auto h-12 w-1/2 rounded-wakil" />
        <Skeleton className="h-10 w-2/5 rounded-wakil" />
      </div>
      <span role="status" className="sr-only">{t("common.loading")}</span>
    </div>
  );
}

export function Thread() {
  const { id } = useParams<{ id: string }>();
  // Keyed by chat: switching chats starts from an empty thread, with no messages from the last one.
  return <ThreadView key={id ?? ""} id={id} />;
}

function ThreadView({ id }: { id: string | undefined }) {
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const rtl = lang === "ar";
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [faqFor, setFaqFor] = useState<{ question: string; answer: string } | null>(null);
  const [faqSaved, setFaqSaved] = useState<Set<string>>(new Set());
  const [faqMsgId, setFaqMsgId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // created_at of the newest message already on screen. Messages after it animate in; older ones do not.
  const newestAtRef = useRef<string | null>(null);
  // Id of the newest customer message already announced. undefined until the first messages arrive.
  const inboundRef = useRef<string | null | undefined>(undefined);

  // The chat header and the newest page of messages. Messages loaded earlier by "Load earlier" stay.
  const loadNewest = useCallback(async (): Promise<Msg[] | undefined> => {
    if (!id) return undefined;
    const [c, m] = await Promise.all([
      supabase.from("conversations")
        .select("id,store_id,channel_id,status,handoff_reason,customers(display_name,platform_user_id),channels(platform)")
        .eq("id", id).single(),
      supabase.from("messages")
        .select("id,direction,sender,body,created_at,delivery_status,delivery_error")
        .eq("conversation_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE),
    ]);
    if (c.error || m.error) { setFailed(true); return undefined; }
    setFailed(false);
    setConv(c.data as unknown as Conv);
    const newest = ((m.data ?? []) as Msg[]).slice().reverse();
    setMsgs((prev) => {
      const floor = newest[0]?.created_at;
      const older = floor ? prev.filter((x) => x.created_at < floor) : [];
      return mergeMsgs(older, newest);
    });
    setHasOlder((prev) => prev || newest.length === PAGE);
    return newest;
  }, [id]);

  // Replies are delivered to Instagram by a function; this asks it to (re)send what is waiting.
  // Safe to repeat: the server sends each message at most once.
  const deliver = useCallback(async () => {
    if (!id) return;
    await supabase.functions.invoke("deliver-messages", { body: { conversation_id: id } });
  }, [id]);

  // Load, and when something is still waiting to go out (a reply whose delivery was interrupted),
  // ask for it to be sent and look again.
  const refresh = useCallback(async () => {
    const rows = await loadNewest();
    if (rows?.some(isPending)) {
      await deliver();
      await loadNewest();
    }
  }, [loadNewest, deliver]);

  // Realtime for this chat's messages and header; the hook polls as a fallback (60 s, or 15 s without realtime).
  useRealtimeRefresh("messages", id ? `conversation_id=eq.${id}` : undefined, refresh);
  useRealtimeRefresh("conversations", id ? `id=eq.${id}` : undefined, refresh);
  useEffect(() => { void refresh(); }, [refresh]);

  const hasPending = msgs.some(isPending);
  // A reply that is still pending gets a short retry until it goes out. Only runs while one is pending.
  const retryPending = useCallback(async () => {
    await deliver();
    await loadNewest();
  }, [deliver, loadNewest]);
  useEffect(() => {
    if (!hasPending) return;
    const timer = window.setInterval(() => { if (!document.hidden) void retryPending(); }, RETRY_MS);
    return () => window.clearInterval(timer);
  }, [hasPending, retryPending]);

  // Keep the newest message in view. Loading earlier messages does not change it, so the view stays put.
  const lastId = msgs[msgs.length - 1]?.id;
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [lastId]);

  useEffect(() => {
    newestAtRef.current = msgs[msgs.length - 1]?.created_at ?? null;
    // Announce only a new customer message, and only after the first load (what was already there is not news).
    const newestInbound = [...msgs].reverse().find((x) => x.direction === "inbound");
    if (msgs.length === 0) return;
    if (inboundRef.current === undefined) { inboundRef.current = newestInbound?.id ?? null; return; }
    if (newestInbound && newestInbound.id !== inboundRef.current) {
      inboundRef.current = newestInbound.id;
      setAnnounce(`${t("thread.newMessage")}: ${newestInbound.body ?? ""}`);
    }
  }, [msgs, t]);

  async function loadOlder() {
    const oldest = msgs[0];
    if (!id || !oldest || loadingOlder) return;
    setLoadingOlder(true);
    const { data, error: err } = await supabase.from("messages")
      .select("id,direction,sender,body,created_at,delivery_status,delivery_error")
      .eq("conversation_id", id).lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PAGE);
    setLoadingOlder(false);
    if (err) { setError(t("common.error")); return; }
    const rows = ((data ?? []) as Msg[]).slice().reverse();
    setMsgs((prev) => mergeMsgs(rows, prev));
    setHasOlder(rows.length === PAGE);
  }

  async function setStatus(status: Conv["status"]) {
    if (!conv) return;
    setBusy(true); setError(null);
    const patch = status === "bot" ? { status, handoff_reason: null } : { status };
    const { error: err } = await supabase.from("conversations").update(patch).eq("id", conv.id);
    if (err) setError(t("common.error"));
    await loadNewest();
    setBusy(false);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = reply.trim();
    if (!conv || !body || busy) return;
    setBusy(true); setError(null); setSent(false);
    const { error: err } = await supabase.from("messages").insert({
      store_id: conv.store_id,
      conversation_id: conv.id,
      channel_id: conv.channel_id,
      direction: "outbound",
      sender: "owner",
      body,
      delivery_status: "pending",
    });
    if (err) { setError(t("common.error")); setBusy(false); return; }
    // Writing as the owner takes the chat over from the assistant.
    if (conv.status !== "human") await supabase.from("conversations").update({ status: "human" }).eq("id", conv.id);
    setReply("");
    await deliver();
    await loadNewest();
    setBusy(false);
    setSent(true);
    window.setTimeout(() => setSent(false), 1200);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
  }

  if (failed) {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Description>
            {t("common.error")}{" "}
            <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void refresh()}>{t("common.retry")}</button>
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (!conv) return <ThreadSkeleton />;

  // The question an owner reply answers: the customer message right before it.
  const questionFor = (msg: Msg) => {
    const i = msgs.indexOf(msg);
    for (let j = i - 1; j >= 0; j--) if (msgs[j].sender === "customer" && msgs[j].body) return msgs[j].body!;
    return "";
  };

  const who = (msg: Msg) => msg.sender === "customer" ? t("thread.customerName") : msg.sender === "owner" ? t("thread.you") : t("thread.assistantName");
  const name = conv.customers?.display_name || conv.customers?.platform_user_id || t("inbox.customer");
  const initial = name.trim().charAt(0).toUpperCase();
  // Only messages newer than what was on screen animate in (not the ones loaded by "Load earlier").
  const isFresh = (msg: Msg) => !reduced && newestAtRef.current !== null && msg.created_at > newestAtRef.current;

  return (
    <div className="flex min-h-[70dvh] min-w-0 flex-1 flex-col overflow-hidden rounded-wakil-lg border-2 border-ink bg-slip shadow-ink lg:min-h-[70vh]">
      <header className="flex flex-wrap items-center gap-2 border-b-2 border-ink bg-slip px-3 py-2">
        <Link to="/inbox" aria-label={t("thread.back")}
          className="grid size-11 shrink-0 place-items-center rounded-full text-ink hover:bg-ink/5 lg:hidden">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:rotate-180">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <m.span layoutId={`avatar-${conv.id}`} className="inline-flex shrink-0">
          <Avatar size="sm" className="border-2 border-ink bg-blue text-slip" aria-hidden="true">
            <Avatar.Fallback className="bg-blue font-semibold text-slip">{initial}</Avatar.Fallback>
          </Avatar>
        </m.span>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-base font-bold text-ink">{name}</h1>
          <span className="text-[13px] text-soft">{t(platformKey(conv.channels?.platform))}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {conv.status !== "bot" && (
            <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void setStatus("bot")}>{t("thread.handBack")}</Button>
          )}
          {conv.status !== "closed"
            ? <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void setStatus("closed")}>{t("thread.close")}</Button>
            : <Button size="sm" variant="primary" isDisabled={busy} onPress={() => void setStatus("human")}>{t("thread.reopen")}</Button>}
        </div>
      </header>

      <AnimatePresence initial={false}>
        {conv.status === "human" && conv.handoff_reason && (
          <m.div key="handoff" role="status" className="border-b-2 border-ink bg-red/10 px-4 py-2 text-sm text-red"
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: dur.short, ease: ease.out }}>
            <strong>{t("inbox.reason")}:</strong> {conv.handoff_reason}
          </m.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-paper/60 px-4 py-4">
        {hasOlder && (
          <div className="flex justify-center">
            <Button size="sm" variant="outline" isDisabled={loadingOlder} onPress={() => void loadOlder()}>{t("thread.loadEarlier")}</Button>
          </div>
        )}
        {msgs.length === 0 && <p className="m-0 text-soft">{t("inbox.noMessages")}</p>}
        {msgs.map((msg) => {
          const inbound = msg.direction === "inbound";
          const assistant = msg.direction === "outbound" && msg.sender === "agent";
          // Customer messages come in from the start side, the store's replies from the end side.
          const fromX = inbound ? (rtl ? 18 : -18) : (rtl ? -18 : 18);
          const bubbleTone = inbound
            ? "border-2 border-ink/20 bg-slip text-ink rounded-es-sm"
            : msg.sender === "owner"
              ? "border-2 border-ink bg-ink text-slip rounded-ee-sm"
              : "border-2 border-blue bg-blue text-slip rounded-ee-sm";
          const animate = isFresh(msg);
          return (
            <m.div key={msg.id} className={`flex min-w-0 flex-col gap-1 ${inbound ? "items-start" : "items-end"}`}
              initial={animate ? { opacity: 0, x: fromX, y: 6 } : false}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: dur.short, ease: ease.out }}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-wakil px-3.5 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere] ${bubbleTone}`}>
                {assistant && (
                  <span className="mb-1 flex items-center gap-1 text-xs font-bold text-slip/90">
                    <span aria-hidden="true" className="inline-flex [&>svg]:size-3"><SparkIcon /></span>
                    {t("thread.assistantName")}
                  </span>
                )}
                {msg.body}
              </div>
              <div className="px-1 text-xs text-soft">
                {!assistant && <>{who(msg)} · </>}<span dir="ltr">{formatTime(msg.created_at, lang)}</span>
                {msg.delivery_status === "pending" && <span> · {t("thread.pending")}</span>}
                {msg.delivery_status === "failed" && <span className="font-semibold text-red"> · {t("thread.notDelivered")}</span>}
              </div>
              {msg.delivery_status === "failed" && msg.delivery_error && <div className="px-1 text-xs text-red">{msg.delivery_error}</div>}
              {msg.sender === "owner" && msg.body && (faqSaved.has(msg.id)
                ? (
                  <Chip size="sm" color="success" variant="soft">
                    <Tick className="me-1 inline-block" />
                    <Chip.Label>{t("thread.faqSaved")}</Chip.Label>
                  </Chip>
                )
                : (
                  <Button size="sm" variant="ghost" className="text-blue"
                    onPress={() => { setFaqMsgId(msg.id); setFaqFor({ question: questionFor(msg), answer: msg.body! }); }}>
                    {t("thread.saveFaq")}
                  </Button>
                ))}
            </m.div>
          );
        })}
        <div ref={endRef} />
      </div>
      {/* Screen readers hear the newest customer message only, not every change in the list. */}
      <div role="status" className="sr-only">{announce}</div>

      <div className="flex flex-col gap-2 border-t-2 border-ink bg-slip px-3 pb-3 pt-2">
        <div className="flex gap-2 overflow-x-auto pb-0.5" role="group" aria-label={t("thread.quickLabel")}>
          {QUICK_REPLIES.map((key) => (
            <Button key={key} size="sm" variant="outline" className="shrink-0 rounded-full" onPress={() => setReply(t(key))}>
              {t(key)}
            </Button>
          ))}
        </div>
        <form onSubmit={send} className="flex flex-col gap-2">
          <TextArea
            value={reply}
            maxLength={1000}
            rows={3}
            onKeyDown={onKey}
            onChange={(e) => setReply(e.target.value)}
            placeholder={t("thread.replyPlaceholder")}
            aria-label={t("thread.replyPlaceholder")}
            className="w-full text-[15px]"
          />
          {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 text-xs text-soft">{t("thread.note")}</span>
            <Button type="submit" isIconOnly variant="primary" className="size-11 shrink-0 rounded-full border-2 border-ink shadow-ink-sm"
              isDisabled={busy || !reply.trim()}>
              <AnimatePresence mode="wait" initial={false}>
                {busy
                  ? <m.span key="busy" className="inline-flex" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: dur.micro }}><Spinner size="sm" color="current" /></m.span>
                  : sent
                    ? <m.span key="sent" className="inline-flex" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.micro }}><Tick /></m.span>
                    : (
                      <m.span key="arrow" className="inline-flex" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ duration: dur.micro }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
                          <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
                        </svg>
                      </m.span>
                    )}
              </AnimatePresence>
              <span className="sr-only">{t("thread.send")}</span>
            </Button>
          </div>
        </form>
      </div>
      {faqFor && (
        <FaqModal storeId={conv.store_id} conversationId={conv.id} initialQuestion={faqFor.question} initialAnswer={faqFor.answer}
          onClose={() => setFaqFor(null)}
          onSaved={() => { if (faqMsgId) setFaqSaved((p) => new Set(p).add(faqMsgId)); setFaqFor(null); }} />
      )}
    </div>
  );
}
