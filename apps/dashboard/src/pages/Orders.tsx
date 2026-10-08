import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { formatMoney, formatTime } from "../lib/format";
import { buildOrderMessage, whatsappUrl } from "../lib/orderMessage";

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
// The next step an owner can take from each status (cancelling is offered separately).
const NEXT: Partial<Record<Status, { to: Status; key: TKey }>> = {
  pending: { to: "confirmed", key: "orders.confirm" },
  confirmed: { to: "shipped", key: "orders.ship" },
  shipped: { to: "delivered", key: "orders.deliver" },
};

export function Orders() {
  const { t, lang } = useI18n();
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
    const { error: err } = await supabase.rpc("set_order_status", { p_order_id: o.id, p_status: to });
    if (err) setError(true);
    await load();
    setBusy(null);
  }

  const count = (s: Status) => (orders ?? []).filter((o) => o.status === s).length;
  const visible = (orders ?? []).filter((o) => o.status === tab);

  return (
    <div>
      <h1 className="text-2xl font-extrabold mt-1 mb-4">{t("orders.title")}</h1>
      <div role="tablist" className="flex flex-wrap gap-2 mb-4">
        {TABS.map((s) => (
          <button key={s} role="tab" className="tab" aria-selected={tab === s} onClick={() => setTab(s)}>
            {t(STATUS_KEY[s])}{orders ? ` (${count(s)})` : ""}
          </button>
        ))}
      </div>

      {failed && <p className="error">{t("common.error")} <button className="btn btn-small" onClick={() => void load()}>{t("common.retry")}</button></p>}
      {error && <p className="error" role="alert">{t("common.error")}</p>}
      {!orders && !failed && <p className="muted">{t("common.loading")}</p>}
      {orders && orders.length === 0 && <p className="muted card p-5">{t("orders.emptyAll")}</p>}
      {orders && orders.length > 0 && visible.length === 0 && <p className="muted card p-5">{t("orders.empty")}</p>}

      <ul className="list-none p-0 m-0 flex flex-col gap-3">
        {visible.map((o) => {
          const next = NEXT[o.status];
          return (
            <li key={o.id} className="card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate">{o.customer_name}</div>
                  <a href={`tel:${o.phone}`} className="text-sm" dir="ltr">{t("orders.call")} {o.phone}</a>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {whatsappUrl(o.phone, messageFor(o)) && (
                      <a className="btn btn-small" href={whatsappUrl(o.phone, messageFor(o))!} target="_blank" rel="noopener noreferrer">{t("orders.whatsapp")}</a>
                    )}
                    <button className="btn btn-small" onClick={() => void copyMessage(o)}>
                      {copiedId === o.id ? t("orders.copied") : t("orders.copyMessage")}
                    </button>
                  </div>
                </div>
                <div className="text-end shrink-0">
                  <span className="badge badge-muted">{t(STATUS_KEY[o.status])}</span>
                  <div className="muted text-xs mt-1">{formatTime(o.created_at, lang)}</div>
                </div>
              </div>
              <div className="text-sm">{o.wilaya} · {o.address}</div>
              <ul className="list-none p-0 m-0 text-sm flex flex-col gap-1">
                {o.order_items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3">
                    <span>{i.quantity} × {i.name}{i.variant_label ? ` (${i.variant_label})` : ""}</span>
                    <span className="muted shrink-0">{formatMoney(i.unit_price_cents * i.quantity, currency, lang)}</span>
                  </li>
                ))}
              </ul>
              <div className="text-sm border-t divider pt-2 flex flex-col gap-0.5">
                <div className="flex justify-between"><span className="muted">{t("orders.subtotal")}</span><span>{formatMoney(o.subtotal_cents, currency, lang)}</span></div>
                <div className="flex justify-between"><span className="muted">{t("orders.delivery")}</span><span>{formatMoney(o.delivery_fee_cents, currency, lang)}</span></div>
                <div className="flex justify-between font-bold"><span>{t("orders.total")}</span><span>{formatMoney(o.total_cents, currency, lang)}</span></div>
              </div>
              {(next || o.status === "shipped" || o.status === "confirmed" || o.status === "pending") && (
                <div className="flex gap-2 flex-wrap">
                  {next && <button className="btn btn-primary btn-small" disabled={busy === o.id} onClick={() => void move(o, next.to)}>{t(next.key)}</button>}
                  <button className="btn btn-small" disabled={busy === o.id} onClick={() => void move(o, "cancelled")}>{t("orders.cancel")}</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
