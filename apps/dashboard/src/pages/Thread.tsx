import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { formatTime } from "../lib/format";
import { platformKey } from "./Inbox";

type Conv = {
  id: string;
  store_id: string;
  channel_id: string;
  status: "human" | "bot" | "closed";
  handoff_reason: string | null;
  customers: { display_name: string | null; platform_user_id: string } | null;
  channels: { platform: string } | null;
};
type Msg = {
  id: string;
  direction: "inbound" | "outbound";
  sender: "customer" | "agent" | "owner";
  body: string | null;
  created_at: string;
  delivery_status: string | null;
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
  const endRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    if (!id) return;
    const [c, m] = await Promise.all([
      supabase.from("conversations")
        .select("id,store_id,channel_id,status,handoff_reason,customers(display_name,platform_user_id),channels(platform)")
        .eq("id", id).single(),
      supabase.from("messages")
        .select("id,direction,sender,body,created_at,delivery_status")
        .eq("conversation_id", id).order("created_at", { ascending: true }).limit(500),
    ]);
    if (c.error || m.error) { setFailed(true); return; }
    setFailed(false);
    setConv(c.data as unknown as Conv);
    setMsgs(m.data as Msg[]);
  }, [id]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 8000);
    return () => window.clearInterval(timer);
  }, [load]);

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
    await load();
    setBusy(false);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
  }

  if (failed) return <p className="error">{t("common.error")} <button className="btn btn-small" onClick={() => void load()}>{t("common.retry")}</button></p>;
  if (!conv) return <p className="muted">{t("common.loading")}</p>;

  const who = (m: Msg) => m.sender === "customer" ? t("thread.customerName") : m.sender === "owner" ? t("thread.you") : t("thread.assistantName");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link to="/inbox" className="btn btn-small no-underline" style={{ color: "inherit" }}>← {t("thread.back")}</Link>
        <div className="flex gap-2 flex-wrap">
          {conv.status !== "bot" && <button className="btn btn-small" disabled={busy} onClick={() => void setStatus("bot")}>{t("thread.handBack")}</button>}
          {conv.status !== "closed"
            ? <button className="btn btn-small" disabled={busy} onClick={() => void setStatus("closed")}>{t("thread.close")}</button>
            : <button className="btn btn-small" disabled={busy} onClick={() => void setStatus("human")}>{t("thread.reopen")}</button>}
        </div>
      </div>

      <div className="card p-4">
        <div className="font-bold">{conv.customers?.display_name || conv.customers?.platform_user_id || t("inbox.customer")}</div>
        <span className="badge badge-muted mt-1">{t(platformKey(conv.channels?.platform))}</span>
        {conv.status === "human" && conv.handoff_reason && (
          <div className="text-sm rounded-lg px-3 py-2 mt-3" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>
            <strong>{t("inbox.reason")}:</strong> {conv.handoff_reason}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 py-2" aria-live="polite">
        {msgs.length === 0 && <p className="muted">{t("inbox.noMessages")}</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex flex-col gap-0.5 w-full ${m.direction === "inbound" ? "items-start" : "items-end"}`}>
            <div className={`bubble ${m.direction === "inbound" ? "bubble-in" : m.sender === "owner" ? "bubble-owner" : "bubble-out"}`}>{m.body}</div>
            <div className="muted text-xs">
              {who(m)} · {formatTime(m.created_at, lang)}
              {m.delivery_status === "pending" && <span> · {t("thread.pending")}</span>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="card p-3 flex flex-col gap-2">
        <textarea className="input" style={{ minHeight: 84 }} value={reply} maxLength={1000} onKeyDown={onKey}
          onChange={(e) => setReply(e.target.value)} placeholder={t("thread.replyPlaceholder")} aria-label={t("thread.replyPlaceholder")} />
        {error && <p className="error m-0" role="alert">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="muted text-xs">{t("thread.note")}</span>
          <button className="btn btn-primary shrink-0" disabled={busy || !reply.trim()}>{t("thread.send")}</button>
        </div>
      </form>
    </div>
  );
}
