import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Alert, Avatar, Button, Chip, Spinner, TextArea } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { formatTime } from "../lib/format";
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

export function Thread() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const rtl = lang === "ar";
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [failed, setFailed] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faqFor, setFaqFor] = useState<{ question: string; answer: string } | null>(null);
  const [faqSaved, setFaqSaved] = useState<Set<string>>(new Set());
  const [faqMsgId, setFaqMsgId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  // Messages already on screen do not animate; only ones that arrive afterwards do.
  const firstLoadRef = useRef(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [c, m] = await Promise.all([
      supabase.from("conversations")
        .select("id,store_id,channel_id,status,handoff_reason,customers(display_name,platform_user_id),channels(platform)")
        .eq("id", id).single(),
      supabase.from("messages")
        .select("id,direction,sender,body,created_at,delivery_status,delivery_error")
        .eq("conversation_id", id).order("created_at", { ascending: true }).limit(500),
    ]);
    if (c.error || m.error) { setFailed(true); return; }
    setFailed(false);
    setConv(c.data as unknown as Conv);
    setMsgs(m.data as Msg[]);
    return m.data as Msg[];
  }, [id]);

  // Replies are delivered to Instagram by a function; this asks it to (re)send what is waiting.
  // Safe to repeat: the server sends each message at most once.
  const deliver = useCallback(async () => {
    if (!id) return;
    await supabase.functions.invoke("deliver-messages", { body: { conversation_id: id } });
  }, [id]);

  useEffect(() => {
    // Load, and when something is still waiting to go out (a reply whose delivery was interrupted),
    // ask for it to be sent and look again.
    const refresh = async () => {
      const rows = await load();
      if (rows?.some((r) => r.direction === "outbound" && r.delivery_status === "pending")) {
        await deliver();
        await load();
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 8000);
    return () => window.clearInterval(timer);
  }, [load, deliver]);

  useEffect(() => {
    if (msgs.length !== lastCount.current) {
      lastCount.current = msgs.length;
      endRef.current?.scrollIntoView({ block: "end" });
    }
    if (msgs.length > 0) firstLoadRef.current = false;
  }, [msgs]);

  async function setStatus(status: Conv["status"]) {
    if (!conv) return;
    setBusy(true); setError(null);
    const patch = status === "bot" ? { status, handoff_reason: null } : { status };
    const { error: err } = await supabase.from("conversations").update(patch).eq("id", conv.id);
    if (err) setError(t("common.error"));
    await load();
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
    await load();
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
            <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void load()}>{t("common.retry")}</button>
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (!conv) return <p className="text-soft">{t("common.loading")}</p>;

  // The question an owner reply answers: the customer message right before it.
  const questionFor = (msg: Msg) => {
    const i = msgs.indexOf(msg);
    for (let j = i - 1; j >= 0; j--) if (msgs[j].sender === "customer" && msgs[j].body) return msgs[j].body!;
    return "";
  };

  const who = (msg: Msg) => msg.sender === "customer" ? t("thread.customerName") : msg.sender === "owner" ? t("thread.you") : t("thread.assistantName");
  const name = conv.customers?.display_name || conv.customers?.platform_user_id || t("inbox.customer");
  const initial = name.trim().charAt(0).toUpperCase();
  const animateNew = !firstLoadRef.current && !reduced;

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

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-paper/60 px-4 py-4" aria-live="polite">
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
          return (
            <m.div key={msg.id} className={`flex min-w-0 flex-col gap-1 ${inbound ? "items-start" : "items-end"}`}
              initial={animateNew ? { opacity: 0, x: fromX, y: 6 } : false}
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
