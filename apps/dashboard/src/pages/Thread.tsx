import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { formatTime } from "../lib/format";
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

export function Thread() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [conv, setConv] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [failed, setFailed] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faqFor, setFaqFor] = useState<{ question: string; answer: string } | null>(null);
  const [faqSaved, setFaqSaved] = useState<Set<string>>(new Set());
  const [faqMsgId, setFaqMsgId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

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
    setBusy(true); setError(null);
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
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
  }

  if (failed) return <p className="error">{t("common.error")} <button className="btn btn-small" onClick={() => void load()}>{t("common.retry")}</button></p>;
  if (!conv) return <p className="muted">{t("common.loading")}</p>;

  // The question an owner reply answers: the customer message right before it.
  const questionFor = (m: Msg) => {
    const i = msgs.indexOf(m);
    for (let j = i - 1; j >= 0; j--) if (msgs[j].sender === "customer" && msgs[j].body) return msgs[j].body!;
    return "";
  };

  const who = (m: Msg) => m.sender === "customer" ? t("thread.customerName") : m.sender === "owner" ? t("thread.you") : t("thread.assistantName");
  const name = conv.customers?.display_name || conv.customers?.platform_user_id || t("inbox.customer");

  return (
    <div className="flex flex-col flex-1 min-w-0 card overflow-hidden lg:min-h-[70vh]">
      <header className="flex items-center gap-2 px-3 py-2 border-b flex-wrap" style={{ borderColor: "var(--divider)", background: "var(--surface)" }}>
        <Link to="/inbox" aria-label={t("thread.back")} className="grid place-items-center shrink-0 rounded-full lg:hidden"
          style={{ width: 44, height: 44, color: "var(--heading)" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:rotate-180">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div aria-hidden="true" className="shrink-0 grid place-items-center rounded-full text-sm font-semibold"
          style={{ width: 36, height: 36, background: "var(--surface-2)", color: "var(--heading)" }}>
          {name.trim().charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="m-0 text-base font-semibold truncate" style={{ color: "var(--heading)" }}>{name}</h1>
          <span className="text-[13px] muted">{t(platformKey(conv.channels?.platform))}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {conv.status !== "bot" && <button className="btn btn-small" disabled={busy} onClick={() => void setStatus("bot")}>{t("thread.handBack")}</button>}
          {conv.status !== "closed"
            ? <button className="btn btn-small" disabled={busy} onClick={() => void setStatus("closed")}>{t("thread.close")}</button>
            : <button className="btn btn-small" disabled={busy} onClick={() => void setStatus("human")}>{t("thread.reopen")}</button>}
        </div>
      </header>

      {conv.status === "human" && conv.handoff_reason && (
        <div className="px-4 py-2 text-sm border-b" style={{ background: "var(--warn-soft)", color: "var(--warn)", borderColor: "var(--warn-border)" }}>
          <strong>{t("inbox.reason")}:</strong> {conv.handoff_reason}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" aria-live="polite" style={{ background: "var(--bg)" }}>
        {msgs.length === 0 && <p className="muted m-0">{t("inbox.noMessages")}</p>}
        {msgs.map((m) => {
          const assistant = m.direction === "outbound" && m.sender === "agent";
          return (
            <div key={m.id} className={`flex flex-col gap-1 min-w-0 ${m.direction === "inbound" ? "items-start" : "items-end"}`}>
              <div className={`bubble text-[15px] ${m.direction === "inbound" ? "bubble-in" : m.sender === "owner" ? "bubble-owner" : "bubble-out"}`}>
                {assistant && (
                  <span className="flex items-center gap-1 mb-1 text-xs font-semibold" style={{ color: "var(--brand)" }}>
                    <span aria-hidden="true" className="inline-flex [&>svg]:size-3"><SparkIcon /></span>
                    {t("thread.assistantName")}
                  </span>
                )}
                {m.body}
              </div>
              <div className="muted text-xs px-1">
                {!assistant && <>{who(m)} · </>}{formatTime(m.created_at, lang)}
                {m.delivery_status === "pending" && <span> · {t("thread.pending")}</span>}
                {m.delivery_status === "failed" && <span style={{ color: "var(--warn)" }}> · {t("thread.notDelivered")}</span>}
              </div>
              {m.delivery_status === "failed" && m.delivery_error && <div className="text-xs px-1" style={{ color: "var(--warn)" }}>{m.delivery_error}</div>}
              {m.sender === "owner" && m.body && (faqSaved.has(m.id)
                ? <span className="badge badge-ok">{t("thread.faqSaved")}</span>
                : <button className="btn btn-small" onClick={() => { setFaqMsgId(m.id); setFaqFor({ question: questionFor(m), answer: m.body! }); }}>{t("thread.saveFaq")}</button>)}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="border-t px-3 pt-2 pb-3 flex flex-col gap-2" style={{ borderColor: "var(--divider)", background: "var(--surface)" }}>
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label={t("thread.quickLabel")}>
          {QUICK_REPLIES.map((key) => (
            <button key={key} type="button" onClick={() => setReply(t(key))}
              className="shrink-0 rounded-full border px-3 text-[13px] font-medium"
              style={{ minHeight: 36, background: "var(--surface-2)", color: "var(--heading)", borderColor: "var(--border)" }}>
              {t(key)}
            </button>
          ))}
        </div>
        <form onSubmit={send} className="flex flex-col gap-2">
          <textarea className="input" style={{ minHeight: 72, fontSize: 15 }} value={reply} maxLength={1000} onKeyDown={onKey}
            onChange={(e) => setReply(e.target.value)} placeholder={t("thread.replyPlaceholder")} aria-label={t("thread.replyPlaceholder")} />
          {error && <p className="error m-0" role="alert">{error}</p>}
          <div className="flex items-center gap-3">
            <span className="muted text-xs flex-1 min-w-0">{t("thread.note")}</span>
            <button className="btn btn-primary shrink-0 rounded-full" style={{ width: 44, height: 44, padding: 0 }} disabled={busy || !reply.trim()}>
              <span className="sr-only">{t("thread.send")}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
                <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
              </svg>
            </button>
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
