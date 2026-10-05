import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { _dicts, useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { platformKey } from "./Inbox";

type Turn = { role: "customer" | "assistant"; text: string; note?: string };
type Channel = { id: string; platform: string; display_name: string | null; status: string };

const randomId = () => Math.random().toString(36).slice(2, 10);

function monthStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function UsageMeter() {
  const { t } = useI18n();
  const { store } = useStore();
  const [used, setUsed] = useState<number | null>(null);
  const limit = store!.monthly_reply_limit;

  const load = useCallback(async () => {
    const { count } = await supabase
      .from("agent_runs").select("id", { count: "exact", head: true })
      .eq("source", "customer").eq("fast_path", false).is("error", null)
      .gte("created_at", monthStartIso());
    setUsed(count ?? 0);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (used === null) return null;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  const out = used >= limit;
  const near = !out && used >= limit * 0.8;
  return (
    <div className="card p-4 mb-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold">{t("assistant.usage")}</span>
        <span className="muted text-sm">{t("assistant.usageOf", { used, limit })}</span>
      </div>
      <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full" style={{ width: `${pct}%`, background: out ? "var(--danger, #c0392b)" : near ? "var(--warn-text)" : "var(--brand)" }} />
      </div>
      {(near || out) && (
        <p className="text-sm mt-2 mb-0" style={{ color: "var(--warn-text)" }}>{out ? t("assistant.usageOut") : t("assistant.usageNear")}</p>
      )}
    </div>
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
    <div className="card p-4 mb-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-extrabold m-0">{t("assistant.testTitle")}</h2>
        <button className="btn btn-small" onClick={newChat}>{t("assistant.newChat")}</button>
      </div>
      <p className="muted text-sm mt-1">{t("assistant.testIntro")}</p>

      <div className="flex flex-col gap-2 py-2 min-h-24" aria-live="polite">
        {turns.length === 0 && <p className="muted text-sm">{t("assistant.example")}</p>}
        {turns.map((m, i) => (
          <div key={i} className={`flex flex-col gap-0.5 w-full ${m.role === "customer" ? "items-start" : "items-end"}`}>
            <div className={`bubble ${m.role === "customer" ? "bubble-in" : "bubble-out"}`}>{m.text}</div>
            {m.note && <div className="muted text-xs">{m.note}</div>}
          </div>
        ))}
        {busy && <p className="muted text-sm m-0">{t("assistant.typing")}</p>}
        <div ref={endRef} />
      </div>

      {handedOver && <p className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--warn-bg)", color: "var(--warn-text)" }}>{t("assistant.handedOver")}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={send} className="flex gap-2">
        <input className="input" value={text} maxLength={1000} disabled={handedOver}
          onChange={(e) => setText(e.target.value)} placeholder={t("assistant.placeholder")} aria-label={t("assistant.placeholder")} />
        <button className="btn btn-primary shrink-0" disabled={busy || handedOver || !text.trim()}>{t("assistant.send")}</button>
      </form>
    </div>
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
    <section>
      <h2 className="text-lg font-extrabold mt-0 mb-1">{t("channels.title")}</h2>
      <p className="muted mt-0 mb-3">{t("channels.intro")}</p>
      {notice && <p role={notice.kind === "error" ? "alert" : "status"} className="text-sm rounded-lg px-3 py-2" style={noticeStyle(notice.kind)}>{notice.text}</p>}
      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div className="card p-4 flex items-center justify-between gap-3">
          <div>
            <span className="font-bold">{t("channels.instagram")}</span>
            <div className="muted text-xs">{t("channels.proNote")}</div>
          </div>
          <button className="btn btn-small btn-primary" disabled={busy} onClick={() => void connect()}>{t("channels.connect")}</button>
        </div>
        <div className="card p-4 flex items-center justify-between gap-3">
          <span className="font-bold">{t("channels.facebook")}</span>
          <button className="btn btn-small" disabled>{t("channels.soon")}</button>
        </div>
      </div>
      {failed && <p className="error">{t("common.error")}</p>}
      {channels && channels.length === 0 && <p className="muted">{t("channels.none")}</p>}
      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {(channels ?? []).map((c) => (
          <li key={c.id} className="card p-4 flex items-center justify-between gap-3 flex-wrap">
            <span className="font-semibold">{t(platformKey(c.platform))}{c.display_name ? ` · ${c.display_name}` : ""}</span>
            <span className="flex items-center gap-2">
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
    <div>
      <h1 className="text-2xl font-extrabold mt-1 mb-4">{t("assistant.title")}</h1>
      <UsageMeter />
      <TestChat />
      <ChannelsPanel />
    </div>
  );
}
