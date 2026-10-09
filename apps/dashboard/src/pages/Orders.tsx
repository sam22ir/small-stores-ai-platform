import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, Chip, toast } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { formatMoney, formatTime } from "../lib/format";
import { buildOrderMessage, whatsappUrl } from "../lib/orderMessage";
import { dur, ease, useMotionSafe } from "../lib/motion";

type Status = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
type Order = {
  id: string;
  customer_name: string;
  phone: string;
  wilaya: string;
  address: string;
  subtotal_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  status: Status;
  created_at: string;
  order_items: { id: string; name: string; variant_label: string; quantity: number; unit_price_cents: number }[];
};

const TABS: Status[] = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
const STATUS_KEY: Record<Status, TKey> = {
  pending: "orders.status.pending",
  confirmed: "orders.status.confirmed",
  shipped: "orders.status.shipped",
  delivered: "orders.status.delivered",
  cancelled: "orders.status.cancelled",
};
// Status chip colours: new = warning, confirmed/shipped = accent, delivered = default, cancelled = danger.
const STATUS_COLOR: Record<Status, "warning" | "accent" | "default" | "danger"> = {
  pending: "warning",
  confirmed: "accent",
  shipped: "accent",
  delivered: "default",
  cancelled: "danger",
};
// The next step an owner can take from each status (cancelling is offered separately).
const NEXT: Partial<Record<Status, { to: Status; key: TKey }>> = {
  pending: { to: "confirmed", key: "orders.confirm" },
  confirmed: { to: "shipped", key: "orders.ship" },
  shipped: { to: "delivered", key: "orders.deliver" },
};

// The status chip pops in each time the status changes, so the move reads as a change.
function StatusChip({ status, label }: { status: Status; label: string }) {
  const reduced = useMotionSafe();
  return (
    <m.span
      key={status}
      className="inline-flex shrink-0"
      initial={reduced ? false : { scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: dur.short, ease: ease.stamp }}
    >
      <Chip size="sm" variant="soft" color={STATUS_COLOR[status]}><Chip.Label>{label}</Chip.Label></Chip>
    </m.span>
  );
}

export function Orders() {
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const { store } = useStore();
  const currency = store!.currency;
  const [tab, setTab] = useState<Status>("pending");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messageFor = (o: Order) => buildOrderMessage(o, {
    greeting: (name) => t("orders.msg.greeting", { name }),
    items: t("orders.msg.items"),
    wilaya: t("orders.msg.wilaya"),
    total: t("orders.msg.total"),
  }, (cents) => formatMoney(cents, currency, lang));

  async function copyMessage(o: Order) {
    try {
      await navigator.clipboard.writeText(messageFor(o));
      setCopiedId(o.id);
      window.setTimeout(() => setCopiedId((id) => (id === o.id ? null : id)), 2000);
    } catch {
      setError(true);
    }
  }

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("orders")
      .select("id,customer_name,phone,wilaya,address,subtotal_cents,delivery_fee_cents,total_cents,status,created_at,order_items(id,name,variant_label,quantity,unit_price_cents)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (err) { setFailed(true); return; }
    setOrders(data as unknown as Order[]); setFailed(false);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
    return () => window.clearInterval(id);
  }, [load]);

  async function move(o: Order, to: Status) {
    if (to === "cancelled" && !window.confirm(t("orders.confirmCancel"))) return;
    setBusy(o.id); setError(false);
    // Optimistic: the card leaves this tab and its chip changes at once; a failure puts it back.
    setOrders((all) => all && all.map((x) => (x.id === o.id ? { ...x, status: to } : x)));
    const { error: err } = await supabase.rpc("set_order_status", { p_order_id: o.id, p_status: to });
    if (err) { setError(true); toast.danger(t("common.error")); }
    else toast.success(t("common.saved"));
    await load();
    setBusy(null);
  }

  const count = (s: Status) => (orders ?? []).filter((o) => o.status === s).length;
  const visible = (orders ?? []).filter((o) => o.status === tab);

  return (
    <m.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
    >
      <h1 className="mb-4 mt-1 text-[22px] font-extrabold text-ink">{t("orders.title")}</h1>
      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
            className={`relative min-h-10 rounded-full border-2 px-3.5 text-sm font-bold transition-colors ${tab === s ? "border-ink bg-ink text-slip" : "border-ink/20 bg-slip text-ink hover:border-ink"}`}
          >
            {t(STATUS_KEY[s])}{orders ? ` (${count(s)})` : ""}
          </button>
        ))}
      </div>

      {failed && <Alert status="danger" className="mb-3"><Alert.Content><Alert.Description>{t("common.error")} <Button size="sm" variant="outline" onPress={() => void load()}>{t("common.retry")}</Button></Alert.Description></Alert.Content></Alert>}
      {error && <Alert status="danger" className="mb-3"><Alert.Content><Alert.Description role="alert">{t("common.error")}</Alert.Description></Alert.Content></Alert>}
      {!orders && !failed && <p className="text-soft">{t("common.loading")}</p>}
      {orders && orders.length === 0 && <p className="rounded-wakil-lg border-2 border-ink bg-slip p-8 text-center text-soft">{t("orders.emptyAll")}</p>}
      {orders && orders.length > 0 && visible.length === 0 && <p className="rounded-wakil-lg border-2 border-ink bg-slip p-8 text-center text-soft">{t("orders.empty")}</p>}

      <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
        <AnimatePresence initial={false}>
          {visible.map((o) => {
            const next = NEXT[o.status];
            const wa = whatsappUrl(o.phone, messageFor(o));
            return (
              <m.li
                key={o.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.97 }}
                transition={{ duration: dur.short, ease: ease.out }}
                className="flex flex-col gap-3 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-extrabold text-ink">{o.customer_name}</div>
                    <div className="mt-0.5 text-xs text-soft">{formatTime(o.created_at, lang)}</div>
                  </div>
                  <AnimatePresence mode="wait" initial={false}>
                    <StatusChip key={o.status} status={o.status} label={t(STATUS_KEY[o.status])} />
                  </AnimatePresence>
                </div>
                <div className="text-sm text-soft">{o.wilaya} · {o.address}</div>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {o.order_items.map((i) => (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span>{i.quantity} × {i.name}{i.variant_label ? ` (${i.variant_label})` : ""}</span>
                      <span className="shrink-0 text-soft">{formatMoney(i.unit_price_cents * i.quantity, currency, lang)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-1 border-t border-ink/10 pt-3 text-sm">
                  <div className="flex justify-between"><span className="text-soft">{t("orders.subtotal")}</span><span>{formatMoney(o.subtotal_cents, currency, lang)}</span></div>
                  <div className="flex justify-between"><span className="text-soft">{t("orders.delivery")}</span><span>{formatMoney(o.delivery_fee_cents, currency, lang)}</span></div>
                  <div className="flex justify-between pt-1 font-extrabold text-ink"><span>{t("orders.total")}</span><span>{formatMoney(o.total_cents, currency, lang)}</span></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {next && <Button size="sm" variant="primary" isDisabled={busy === o.id} onPress={() => void move(o, next.to)}>{t(next.key)}</Button>}
                  <Button size="sm" variant="outline" render={(p: object) => <a {...p} href={`tel:${o.phone}`} dir="ltr" />}>{t("orders.call")} {o.phone}</Button>
                  {wa && (
                    <Button size="sm" variant="outline" render={(p: object) => <a {...p} href={wa} target="_blank" rel="noopener noreferrer" />}>{t("orders.whatsapp")}</Button>
                  )}
                  <Button size="sm" variant="outline" onPress={() => void copyMessage(o)}>
                    {copiedId === o.id ? `✓ ${t("orders.copied")}` : t("orders.copyMessage")}
                  </Button>
                  {(next || o.status === "shipped" || o.status === "confirmed" || o.status === "pending") && (
                    <Button size="sm" variant="ghost" className="text-red" isDisabled={busy === o.id} onPress={() => void move(o, "cancelled")}>{t("orders.cancel")}</Button>
                  )}
                </div>
              </m.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </m.div>
  );
}
