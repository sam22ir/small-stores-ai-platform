import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { _dicts, useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { platformKey } from "./Inbox";
import { SparkIcon } from "../components/icons";

type Turn = { role: "customer" | "assistant"; text: string; note?: string };
type Channel = { id: string; platform: string; display_name: string | null; status: string };

const randomId = () => Math.random().toString(36).slice(2, 10);

const SECTION_TITLE = "text-[15px] font-semibold text-[var(--heading)] m-0";

function UsageMeter() {
  const { t } = useI18n();
  const { store } = useStore();
  const [usage, setUsage] = useState<{ used: number; conversations: number } | null>(null);
  const limit = store!.monthly_reply_limit;

  const load = useCallback(async () => {
    const { data } = await supabase.functions.invoke("assistant-chat", {
      body: { store_id: store!.id, action: "usage" },
    });
    const u = (data as { usage?: { used?: number; conversations?: number } } | null)?.usage;
    setUsage({ used: u?.used ?? 0, conversations: u?.conversations ?? 0 });
  }, [store]);
  useEffect(() => { void load(); }, [load]);

  if (usage === null) return null;
  const { used, conversations } = usage;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const out = used >= limit;
  const near = !out && used >= limit * 0.8;
  const barColor = out ? "var(--danger)" : near ? "var(--warn)" : "var(--brand)";
  return (
    <section className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className={SECTION_TITLE}>{t("assistant.usage")}</span>
        <span className="muted text-[13px]">{t("assistant.usageOf", { used, limit })}</span>
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-[28px] leading-none font-semibold tabular-nums text-[var(--heading)]">{used}</div>
          <div className="muted text-[12px] mt-1">{t("assistant.statReplies")}</div>
        </div>
        <div>
          <div className="text-[28px] leading-none font-semibold tabular-nums text-[var(--heading)]">{conversations}</div>
          <div className="muted text-[12px] mt-1">{t("assistant.statConversations")}</div>
        </div>
        {conversations > 0 && (
          <p className="muted text-[13px] m-0 pb-0.5">
            {t("assistant.usageConversations", { used, conversations })} {t("assistant.usageRatio", { ratio: (used / conversations).toFixed(1) })}
          </p>
        )}
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-[var(--surface-2)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      {(near || out) && (
        <p className="text-[13px] m-0" style={{ color: out ? "var(--danger)" : "var(--warn)" }}>{out ? t("assistant.usageOut") : t("assistant.usageNear")}</p>
      )}
    </section>
  );
}

function TestChat() {
  const { t } = useI18n();
  const { store } = useStore();
  const [sid, setSid] = useState(() => {
    try { return sessionStorage.getItem("testSid") ?? randomId(); } catch { return randomId(); }
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handedOver, setHandedOver] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { try { sessionStorage.setItem("testSid", sid); } catch { /* ignore */ } }, [sid]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [turns, busy]);

  function newChat() {
    setSid(randomId()); setTurns([]); setHandedOver(false); setError(null); setText("");
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const msg = text.trim();
    if (!msg || busy || handedOver) return;
    setBusy(true); setError(null); setText("");
    setTurns((p) => [...p, { role: "customer", text: msg }]);

    const { data, error: err } = await supabase.functions.invoke("assistant-chat", {
      body: { store_id: store!.id, text: msg, session_id: sid },
    });
    if (err) {
      const status = (err as { context?: { status?: number } }).context?.status;
      setError(status === 429 ? t("assistant.tooMany") : t("common.error"));
    } else if (data?.reply) {
      const tools: string[] = data.tool_calls ?? [];
      setTurns((p) => [...p, {
        role: "assistant",
        text: data.reply,
        note: data.fast_path ? t("assistant.fast") : tools.includes("create_order") ? t("assistant.testOrder") : undefined,
      }]);
      if (data.status === "human") setHandedOver(true);
    } else if (data?.status && data.status !== "bot") {
      setHandedOver(true);
    }
    setBusy(false);
  }

  return (
    <section className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className={SECTION_TITLE}>{t("assistant.testTitle")}</h2>
        <button className="btn btn-small" onClick={newChat}>{t("assistant.newChat")}</button>
      </div>
      <p className="muted text-[13px] m-0">{t("assistant.testIntro")}</p>

      <div className="flex flex-col gap-2 min-h-24" aria-live="polite">
        {turns.length === 0 && <p className="muted text-[13px] m-0">{t("assistant.example")}</p>}
        {turns.map((m, i) => (
          <div key={i} className={`flex flex-col gap-0.5 w-full ${m.role === "customer" ? "items-start" : "items-end"}`}>
            <div className={`bubble text-[15px] ${m.role === "customer" ? "bubble-in" : "bubble-out"}`}>
              {m.role === "assistant" && (
                <div className="flex items-center gap-1 text-[12px] font-semibold mb-0.5" style={{ color: "var(--brand)" }}>
                  <span className="inline-flex [&>svg]:size-3.5" aria-hidden="true"><SparkIcon /></span>
                  {t("assistant.title")}
                </div>
              )}
              {m.text}
            </div>
            {m.note && <div className="muted text-xs">{m.note}</div>}
          </div>
        ))}
        {busy && <p className="muted text-[13px] m-0">{t("assistant.typing")}</p>}
        <div ref={endRef} />
      </div>

      {handedOver && <p className="text-[13px] rounded-xl px-3 py-2 m-0" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>{t("assistant.handedOver")}</p>}
      {error && <p className="error m-0" role="alert">{error}</p>}
      <form onSubmit={send} className="flex items-center gap-2">
        <input className="input" value={text} maxLength={1000} disabled={handedOver}
          onChange={(e) => setText(e.target.value)} placeholder={t("assistant.placeholder")} aria-label={t("assistant.placeholder")} />
        <button className="btn btn-primary btn-icon shrink-0" disabled={busy || handedOver || !text.trim()}>
          <span className="sr-only">{t("assistant.send")}</span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </form>
    </section>
  );
}

type Notice = { kind: "ok" | "warn" | "error"; text: string };

function ChannelsPanel() {
  const { t } = useI18n();
  const { store } = useStore();
  const [params, setParams] = useSearchParams();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("channels").select("id,platform,display_name,status").order("created_at");
    if (error) setFailed(true); else { setFailed(false); setChannels((data as Channel[]).filter((c) => c.platform !== "playground")); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Instagram sends the owner back here as /assistant?instagram=connected or ?instagram=error&reason=...
  useEffect(() => {
    const result = params.get("instagram");
    if (!result) return;
    if (result === "connected") {
      setNotice(params.get("warning") === "subscribe_failed"
        ? { kind: "warn", text: t("channels.warnSubscribe") }
        : { kind: "ok", text: t("channels.okConnected") });
    } else {
      const key = `channels.error.${params.get("reason") ?? ""}` as TKey;
      setNotice({ kind: "error", text: key in _dicts.en ? t(key) : t("common.error") });
    }
    setParams({}, { replace: true });
    void load();
  }, [params, setParams, t, load]);

  async function connect() {
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.functions.invoke("instagram-connect", { body: { action: "start", store_id: store!.id } });
    if (error || !data?.url) {
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      setNotice({ kind: "error", text: status === 503 ? t("channels.error.not_configured") : t("common.error") });
      setBusy(false);
      return;
    }
    window.location.assign(data.url as string); // Instagram's approval page; it returns to this page
  }

  async function disconnect(c: Channel) {
    if (!window.confirm(t("channels.disconnectConfirm"))) return;
    setBusy(true); setNotice(null);
    const { error } = await supabase.functions.invoke("instagram-connect", { body: { action: "disconnect", store_id: store!.id, channel_id: c.id } });
    if (error) setNotice({ kind: "error", text: t("common.error") });
    await load();
    setBusy(false);
  }

  const noticeStyle = (k: Notice["kind"]) => k === "ok"
    ? { background: "var(--ok-bg)", color: "var(--ok-text)" }
    : { background: "var(--warn-bg)", color: "var(--warn-text)" };

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className={SECTION_TITLE}>{t("channels.title")}</h2>
        <p className="muted text-[13px] mt-1 mb-0">{t("channels.intro")}</p>
      </div>
      {notice && <p role={notice.kind === "error" ? "alert" : "status"} className="text-[13px] rounded-xl px-3 py-2 m-0" style={noticeStyle(notice.kind)}>{notice.text}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="font-semibold text-[15px] text-[var(--heading)]">{t("channels.instagram")}</span>
            <div className="muted text-[12px] mt-0.5">{t("channels.proNote")}</div>
          </div>
          <button className="btn btn-primary shrink-0" disabled={busy} onClick={() => void connect()}>{t("channels.connect")}</button>
        </div>
        <div className="card p-4 flex items-center justify-between gap-3">
          <span className="font-semibold text-[15px] text-[var(--heading)]">{t("channels.facebook")}</span>
          <button className="btn shrink-0" disabled>{t("channels.soon")}</button>
        </div>
      </div>
      {failed && <p className="error m-0">{t("common.error")}</p>}
      {channels && channels.length === 0 && <p className="muted text-[13px] m-0">{t("channels.none")}</p>}
      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {(channels ?? []).map((c) => (
          <li key={c.id} className="card p-4 flex items-center justify-between gap-3 flex-wrap">
            <span className="font-semibold text-[15px] text-[var(--heading)]">{t(platformKey(c.platform))}{c.display_name ? ` · ${c.display_name}` : ""}</span>
            <span className="flex items-center gap-2 flex-wrap">
              <span className={`badge ${c.status === "active" ? "badge-ok" : "badge-muted"}`}>{t(c.status === "active" ? "channels.connected" : "channels.disconnected")}</span>
              {c.status === "active" && <button className="btn btn-small" disabled={busy} onClick={() => void disconnect(c)}>{t("channels.disconnect")}</button>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Assistant() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-[760px] flex flex-col gap-4">
      <h1 className="text-[20px] font-semibold text-[var(--heading)] mt-1 mb-0">{t("assistant.title")}</h1>
      <UsageMeter />
      <TestChat />
      <ChannelsPanel />
    </div>
  );
}
