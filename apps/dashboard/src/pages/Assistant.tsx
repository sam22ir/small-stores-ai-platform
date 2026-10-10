import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Alert, Avatar, Button, Card, Input, Meter, Spinner } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { platformKey } from "./Inbox";
import { SparkIcon } from "../components/icons";

type Turn = { role: "customer" | "assistant"; text: string; note?: string };
type Channel = { id: string; platform: string; display_name: string | null; status: string };

const randomId = () => Math.random().toString(36).slice(2, 10);

const SECTION_TITLE = "text-base font-bold text-ink m-0";

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
  const barColor = out ? "var(--color-red)" : near ? "oklch(0.72 0.14 80)" : "var(--color-blue)";
  return (
    <Card className="flex flex-col gap-3 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink">
      <div className="flex items-center justify-between gap-2">
        <span className={SECTION_TITLE}>{t("assistant.usage")}</span>
        <span className="text-[13px] text-soft">{t("assistant.usageOf", { used, limit })}</span>
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-[28px] font-extrabold leading-none tabular-nums text-ink">{used}</div>
          <div className="mt-1 text-[12px] text-soft">{t("assistant.statReplies")}</div>
        </div>
        <div>
          <div className="text-[28px] font-extrabold leading-none tabular-nums text-ink">{conversations}</div>
          <div className="mt-1 text-[12px] text-soft">{t("assistant.statConversations")}</div>
        </div>
        {conversations > 0 && (
          <p className="m-0 pb-0.5 text-[13px] text-soft">
            {t("assistant.usageConversations", { used, conversations })} {t("assistant.usageRatio", { ratio: (used / conversations).toFixed(1) })}
          </p>
        )}
      </div>
      <Meter value={pct} aria-label={t("assistant.usage")} className="w-full">
        <Meter.Track className="h-2 overflow-hidden rounded-full border border-ink/20 bg-paper">
          <m.div className="h-full origin-left rtl:origin-right rounded-full" style={{ background: barColor, width: `${pct}%` }}
            initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: dur.slow, ease: ease.out }} />
        </Meter.Track>
      </Meter>
      {(near || out) && (
        <Alert status={out ? "danger" : "warning"}>
          <Alert.Content>
            <Alert.Description>{out ? t("assistant.usageOut") : t("assistant.usageNear")}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </Card>
  );
}

// Three dots that rise in turn while the assistant is answering.
function TypingDots() {
  const reduced = useMotionSafe();
  return (
    <m.div className="flex w-fit items-center gap-1.5 rounded-wakil border-2 border-blue bg-blue px-4 py-3 text-slip"
      initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: dur.micro, ease: ease.out }} role="status" aria-label={undefined}>
      {[0, 1, 2].map((i) => (
        <m.span key={i} aria-hidden="true" className="size-1.5 rounded-full bg-slip"
          animate={reduced ? undefined : { y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }} />
      ))}
    </m.div>
  );
}

function TestChat() {
  const { t, lang } = useI18n();
  const { store } = useStore();
  const reduced = useMotionSafe();
  const rtl = lang === "ar";
  const [sid, setSid] = useState(() => {
    try { return sessionStorage.getItem("testSid") ?? randomId(); } catch { return randomId(); }
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
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
    setBusy(true); setError(null); setText(""); setSent(false);
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
    setSent(true);
    window.setTimeout(() => setSent(false), 1000);
  }

  return (
    <Card className="flex flex-col gap-3 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={SECTION_TITLE}>{t("assistant.testTitle")}</h2>
        <Button size="sm" variant="outline" onPress={newChat}>{t("assistant.newChat")}</Button>
      </div>
      <p className="m-0 text-[13px] text-soft">{t("assistant.testIntro")}</p>

      <div className="flex min-h-24 flex-col gap-2 rounded-wakil border border-ink/15 bg-paper/60 p-3" aria-live="polite">
        {turns.length === 0 && !busy && <p className="m-0 text-[13px] text-soft">{t("assistant.example")}</p>}
        <AnimatePresence initial={false}>
          {turns.map((turn, i) => {
            const customer = turn.role === "customer";
            // Customer messages come from the start side, the assistant's from the end side.
            const fromX = customer ? (rtl ? 18 : -18) : (rtl ? -18 : 18);
            return (
              <m.div key={i} className={`flex w-full min-w-0 flex-col gap-0.5 ${customer ? "items-start" : "items-end"}`}
                initial={reduced ? false : { opacity: 0, x: fromX, y: 6 }} animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: dur.short, ease: ease.out }}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-wakil px-3.5 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere] ${customer
                  ? "border-2 border-ink/20 bg-slip text-ink rounded-es-sm"
                  : "border-2 border-blue bg-blue text-slip rounded-ee-sm"}`}>
                  {!customer && (
                    <div className="mb-0.5 flex items-center gap-1 text-[12px] font-bold text-slip/90">
                      <span className="inline-flex [&>svg]:size-3.5" aria-hidden="true"><SparkIcon /></span>
                      {t("assistant.title")}
                    </div>
                  )}
                  {turn.text}
                </div>
                {turn.note && <div className="text-xs text-soft">{turn.note}</div>}
              </m.div>
            );
          })}
        </AnimatePresence>
        <AnimatePresence>
          {busy && <TypingDots key="typing" />}
        </AnimatePresence>
        {busy && <span className="sr-only">{t("assistant.typing")}</span>}
        <div ref={endRef} />
      </div>

      <AnimatePresence initial={false}>
        {handedOver && (
          <m.div key="handed" initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: dur.short, ease: ease.out }}>
            <Alert status="warning">
              <Alert.Content>
                <Alert.Description>{t("assistant.handedOver")}</Alert.Description>
              </Alert.Content>
            </Alert>
          </m.div>
        )}
      </AnimatePresence>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}

      <form onSubmit={send} className="flex items-center gap-2">
        <Input value={text} maxLength={1000} disabled={handedOver} dir="auto"
          onChange={(e) => setText(e.target.value)} placeholder={t("assistant.placeholder")} aria-label={t("assistant.placeholder")}
          className="min-w-0 flex-1 text-[15px]" />
        <Button type="submit" isIconOnly variant="primary" className="size-11 shrink-0 rounded-full border-2 border-ink shadow-ink-sm"
          isDisabled={busy || handedOver || !text.trim()}>
          <AnimatePresence mode="wait" initial={false}>
            {busy
              ? <m.span key="busy" className="inline-flex" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.micro }}><Spinner size="sm" color="current" /></m.span>
              : sent
                ? <m.span key="sent" className="inline-flex" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.micro }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </m.span>
                : <m.span key="arrow" className="inline-flex" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.micro }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </m.span>}
          </AnimatePresence>
          <span className="sr-only">{t("assistant.send")}</span>
        </Button>
      </form>
    </Card>
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

  const finishedCode = useRef<string | null>(null);
  const showResult = useCallback((r: { ok: boolean; warning?: string; reason?: string }) => {
    if (r.ok) {
      setNotice(r.warning === "subscribe_failed"
        ? { kind: "warn", text: t("channels.warnSubscribe") }
        : { kind: "ok", text: t("channels.okConnected") });
    } else {
      const key = `channels.error.${r.reason ?? ""}` as TKey;
      const msg = t(key);
      setNotice({ kind: "error", text: msg === key ? t("common.error") : msg });
    }
  }, [t]);

  // Instagram sends the owner back here as /assistant?instagram=finish&code=...&state=... (or
  // ?instagram=error&reason=...). The server only connects the account when the signed-in owner
  // who started the login finishes it, so a forwarded approval link can't connect someone else's account.
  useEffect(() => {
    const result = params.get("instagram");
    if (!result) return;
    const code = params.get("code");
    const state = params.get("state");
    setParams({}, { replace: true }); // the code is single use; don't leave it in the address bar
    if (result === "finish" && code && state) {
      if (finishedCode.current === code) return; // the effect can run twice; a code is only good once
      finishedCode.current = code;
      setBusy(true);
      void supabase.functions.invoke("instagram-connect", { body: { action: "finish", code, state } })
        .then(({ data, error }) => showResult(error || !data ? { ok: false } : data))
        .finally(() => { setBusy(false); void load(); });
      return;
    }
    showResult(result === "connected" ? { ok: true, warning: params.get("warning") ?? undefined } : { ok: false, reason: params.get("reason") ?? undefined });
    void load();
  }, [params, setParams, showResult, load]);

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

  const noticeTone = (k: Notice["kind"]) => (k === "error" ? "danger" : k === "warn" ? "warning" : "success") as "danger" | "warning" | "success";

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className={SECTION_TITLE}>{t("channels.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("channels.intro")}</p>
      </div>
      {notice && (
        <div role={notice.kind === "error" ? "alert" : "status"}>
          <Alert status={noticeTone(notice.kind)}>
            <Alert.Content><Alert.Description>{notice.text}</Alert.Description></Alert.Content>
          </Alert>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center justify-between gap-3 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm">
          <div className="min-w-0">
            <span className="text-[15px] font-bold text-ink">{t("channels.instagram")}</span>
            <div className="mt-0.5 text-[12px] text-soft">{t("channels.proNote")}</div>
          </div>
          <Button variant="primary" isDisabled={busy} onPress={() => void connect()} className="shrink-0">{t("channels.connect")}</Button>
        </Card>
        <Card className="flex items-center justify-between gap-3 rounded-wakil-lg border-2 border-ink/25 bg-slip p-4">
          <span className="text-[15px] font-bold text-ink">{t("channels.facebook")}</span>
          <Button variant="outline" isDisabled className="shrink-0">{t("channels.soon")}</Button>
        </Card>
      </div>
      {failed && <Alert status="danger"><Alert.Content><Alert.Description>{t("common.error")}</Alert.Description></Alert.Content></Alert>}
      {channels && channels.length === 0 && <p className="m-0 text-[13px] text-soft">{t("channels.none")}</p>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(channels ?? []).map((c) => (
          <m.li key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.short, ease: ease.out }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-wakil border-2 border-ink bg-slip p-4">
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar size="sm" className="border-2 border-ink bg-paper text-ink"><Avatar.Fallback className="bg-paper font-bold text-ink">{(c.display_name ?? "?").charAt(0).toUpperCase()}</Avatar.Fallback></Avatar>
              <span className="truncate text-[15px] font-bold text-ink">{t(platformKey(c.platform))}{c.display_name ? ` · ${c.display_name}` : ""}</span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${c.status === "active" ? "border-ink bg-blue text-slip" : "border-ink/30 text-soft"}`}>
                {t(c.status === "active" ? "channels.connected" : "channels.disconnected")}
              </span>
              {c.status === "active" && <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void disconnect(c)}>{t("channels.disconnect")}</Button>}
            </span>
          </m.li>
        ))}
      </ul>
    </section>
  );
}

export function Assistant() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <h1 className="mt-1 mb-0 text-2xl font-extrabold text-ink">{t("assistant.title")}</h1>
      <UsageMeter />
      <TestChat />
      <ChannelsPanel />
    </div>
  );
}
