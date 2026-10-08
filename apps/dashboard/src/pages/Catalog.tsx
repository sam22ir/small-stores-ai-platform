import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { Modal } from "../components/Modal";
import { ImportModal } from "../components/ImportModal";
import { useSetupData } from "../lib/setup";
import { LOW_STOCK, STALE_DAYS, centsToInput, formatAgo, formatMoney, parsePrice, parseStock } from "../lib/format";

type Variant = { id: string; label: string; price_cents: number | null; stock_quantity: number; sku: string | null; updated_at: string };
type Product = {
  id: string; name: string; description: string | null; price_cents: number; active: boolean;
  aliases: string | null; stock_checked_at: string; sold_out_until: string | null; product_variants: Variant[];
};
type VDraft = { key: string; id?: string; label: string; stock: string; price: string };
type Draft = { id?: string; name: string; description: string; aliases: string; price: string; active: boolean; variants: VDraft[] };

const DAY = 86_400_000;
// The owner last confirmed or changed this product's numbers at...
const lastTouched = (p: Product) =>
  Math.max(new Date(p.stock_checked_at).getTime(), ...p.product_variants.map((v) => new Date(v.updated_at).getTime()));
const isStale = (p: Product) => p.active && Date.now() - lastTouched(p) > STALE_DAYS * DAY;
const isSoldOut = (p: Product) => !!p.sold_out_until && new Date(p.sold_out_until) > new Date();
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); };

let seq = 0;
const newKey = () => `v${++seq}`;

function toDraft(p?: Product, defaultLabel = "Default"): Draft {
  if (!p) return { name: "", description: "", aliases: "", price: "", active: true, variants: [{ key: newKey(), label: defaultLabel, stock: "0", price: "" }] };
  return {
    id: p.id, name: p.name, description: p.description ?? "", aliases: p.aliases ?? "", price: centsToInput(p.price_cents), active: p.active,
    variants: p.product_variants.map((v) => ({ key: newKey(), id: v.id, label: v.label, stock: String(v.stock_quantity), price: centsToInput(v.price_cents) })),
  };
}

export function Catalog() {
  const { t, lang } = useI18n();
  const { store } = useStore();
  const currency = store!.currency;
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ product?: Product } | null>(null);
  const [params, setParams] = useSearchParams();
  const [importing, setImporting] = useState(params.get("import") === "1");
  const { data: setup } = useSetupData();

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("products")
      .select("id,name,description,price_cents,active,aliases,stock_checked_at,sold_out_until,product_variants(id,label,price_cents,stock_quantity,sku,updated_at)")
      .order("name", { ascending: true })
      .order("label", { referencedTable: "product_variants", ascending: true });
    if (error) { setFailed(true); return; }
    setFailed(false);
    setProducts(data as unknown as Product[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [products, query]);

  async function adjustStock(p: Product, v: Variant, delta: number) {
    const next = Math.max(0, v.stock_quantity + delta);
    if (next === v.stock_quantity) return;
    // Optimistic: show the new number now, roll back if the save fails.
    setProducts((all) => all && all.map((x) => x.id !== p.id ? x : { ...x, product_variants: x.product_variants.map((y) => y.id === v.id ? { ...y, stock_quantity: next, updated_at: new Date().toISOString() } : y) }));
    const { error } = await supabase.from("product_variants").update({ stock_quantity: next }).eq("id", v.id);
    if (error) await load();
  }

  async function toggleActive(p: Product) {
    setProducts((all) => all && all.map((x) => x.id === p.id ? { ...x, active: !p.active } : x));
    const { error } = await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    if (error) await load();
  }

  async function markChecked(ids: string[]) {
    const now = new Date().toISOString();
    setProducts((all) => all && all.map((x) => ids.includes(x.id) ? { ...x, stock_checked_at: now } : x));
    const { error } = await supabase.from("products").update({ stock_checked_at: now }).in("id", ids);
    if (error) await load();
  }

  // "Sold out today" hides a product from customers until tonight without losing the stock count.
  async function toggleSoldOut(p: Product) {
    const until = isSoldOut(p) ? null : endOfToday();
    setProducts((all) => all && all.map((x) => x.id === p.id ? { ...x, sold_out_until: until } : x));
    const { error } = await supabase.from("products").update({ sold_out_until: until }).eq("id", p.id);
    if (error) await load();
  }

  async function remove(p: Product) {
    if (!window.confirm(t("catalog.confirmDelete"))) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (!error) setProducts((all) => all && all.filter((x) => x.id !== p.id)); else await load();
  }

  const staleIds = (products ?? []).filter(isStale).map((p) => p.id);

  const stockBadge = (n: number) =>
    n <= 0 ? <span className="badge badge-bad">{t("catalog.out")}</span>
      : n <= LOW_STOCK ? <span className="badge badge-warn">{t("catalog.low", { n })}</span>
        : <span className="badge badge-ok">{t("catalog.units", { n })}</span>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 mt-1">
        <h1 className="text-[20px] font-semibold m-0" style={{ color: "var(--heading)" }}>{t("catalog.title")}</h1>
        <div className="flex gap-2 shrink-0">
          <button className="btn btn-small" onClick={() => setImporting(true)}>{t("catalog.import")}</button>
          <button className="btn btn-small btn-primary" onClick={() => setEditing({})}>+ {t("catalog.add")}</button>
        </div>
      </div>
      {products && products.length > 0 && setup && !setup.tested && (
        <div className="card px-4 py-3 mb-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--brand-soft)", borderColor: "var(--brand-border)" }} role="status">
          <span className="text-sm font-semibold" style={{ color: "var(--heading)" }}>{t("catalog.tryNudge")}</span>
          <Link to="/assistant" className="btn btn-small btn-primary no-underline">{t("catalog.tryNow")}</Link>
        </div>
      )}
      {staleIds.length > 0 && (
        <div className="card px-4 py-3 mb-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: "var(--warn-soft)", borderColor: "var(--warn-border)", color: "var(--warn)" }} role="status">
          <span className="text-sm">{t("catalog.staleBanner", { n: staleIds.length })}</span>
          <button className="btn btn-small" onClick={() => void markChecked(staleIds)}>{t("catalog.markAllChecked")}</button>
        </div>
      )}
      <input className="input mb-4" type="search" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t("catalog.search")} aria-label={t("catalog.search")} />

      {failed && <p className="error">{t("common.error")} <button className="btn btn-small" onClick={() => void load()}>{t("common.retry")}</button></p>}
      {!products && !failed && <p className="muted">{t("common.loading")}</p>}
      {products && products.length === 0 && (
        <div className="card p-6 text-center">
          <p className="m-0 font-semibold" style={{ color: "var(--heading)" }}>{t("catalog.empty")}</p>
        </div>
      )}
      {products && products.length > 0 && shown.length === 0 && <p className="muted">{t("catalog.noMatch")}</p>}

      <ul className="list-none p-0 m-0 grid gap-3 lg:grid-cols-2">
        {shown.map((p) => (
          <li key={p.id} className="card p-4 flex flex-col gap-3" style={p.active ? undefined : { opacity: 0.65 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[15px]" style={{ color: "var(--heading)" }}>{p.name}</div>
                {p.aliases && <div className="text-[13px] muted truncate">{p.aliases}</div>}
                <div className="text-[15px] font-semibold mt-1">{formatMoney(p.price_cents, currency, lang)}{!p.active && <span className="muted font-normal text-[13px]"> · {t("catalog.hidden")}</span>}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button className="btn btn-small" onClick={() => setEditing({ product: p })}>{t("common.edit")}</button>
                <button className="btn btn-small btn-danger" onClick={() => void remove(p)}>{t("common.delete")}</button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="badge badge-muted">{t("catalog.updated", { when: formatAgo(new Date(lastTouched(p)).toISOString(), lang) })}</span>
              {isStale(p) && <span className="badge badge-warn">{t("catalog.stale")}</span>}
              {isSoldOut(p) && <span className="badge badge-muted">{t("catalog.soldOutBadge")}</span>}
            </div>
            <ul className="list-none p-0 m-0 flex flex-col gap-2">
              {p.product_variants.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: "var(--bg)", border: "1px solid var(--divider)" }}>
                  <div className="min-w-0">
                    <span className="font-semibold text-[15px]">{v.label}</span>
                    {v.price_cents !== null && <span className="muted text-[13px]"> · {formatMoney(v.price_cents, currency, lang)}</span>}
                    <div className="mt-1">{stockBadge(v.stock_quantity)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button className="btn btn-icon" style={{ borderRadius: 999 }} aria-label={t("catalog.decrease")} onClick={() => void adjustStock(p, v, -1)}>−</button>
                    <span className="min-w-10 text-center font-semibold text-[15px] tabular-nums" aria-live="polite">{v.stock_quantity}</span>
                    <button className="btn btn-icon" style={{ borderRadius: 999 }} aria-label={t("catalog.increase")} onClick={() => void adjustStock(p, v, 1)}>+</button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-2 flex-wrap pt-3" style={{ borderTop: "1px solid var(--divider)" }}>
              <label className="flex items-center gap-2 text-[13px] muted">
                <input type="checkbox" checked={p.active} onChange={() => void toggleActive(p)} /> {t("catalog.active")}
              </label>
              <div className="flex gap-2 flex-wrap">
                {isStale(p) && <button className="btn btn-small" onClick={() => void markChecked([p.id])}>{t("catalog.markChecked")}</button>}
                <button className="btn btn-small" onClick={() => void toggleSoldOut(p)}>
                  {isSoldOut(p) ? t("catalog.backInStock") : t("catalog.soldOutToday")}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {importing && (
        <ImportModal storeId={store!.id} existing={products ?? []} onClose={() => { setImporting(false); if (params.has("import")) setParams({}, { replace: true }); }} onDone={load} />
      )}
      {editing && (
        <ProductEditor
          product={editing.product}
          currency={currency}
          storeId={store!.id}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function ProductEditor({ product, currency, storeId, onClose, onSaved }: {
  product?: Product; currency: string; storeId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft>(() => toDraft(product, t("catalog.defaultOption")));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setVariant = (key: string, patch: Partial<VDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => v.key === key ? { ...v, ...patch } : v) }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const name = draft.name.trim();
    if (!name) return setError(t("catalog.errName"));
    const price = parsePrice(draft.price);
    if (price === null) return setError(t("catalog.errPrice"));
    const variants: { id?: string; label: string; stock: number; price: number | null }[] = [];
    for (const v of draft.variants) {
      const label = v.label.trim();
      if (!label) return setError(t("catalog.errLabel"));
      const stock = parseStock(v.stock);
      if (stock === null) return setError(t("catalog.errStock"));
      const vp = v.price.trim() === "" ? null : parsePrice(v.price);
      if (v.price.trim() !== "" && vp === null) return setError(t("catalog.errPrice"));
      variants.push({ id: v.id, label, stock, price: vp });
    }

    setBusy(true);
    try {
      let productId = product?.id;
      const fields = { name, description: draft.description.trim() || null, aliases: draft.aliases.trim() || null, price_cents: price, active: draft.active };
      if (productId) {
        const { error: err } = await supabase.from("products").update(fields).eq("id", productId);
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.from("products").insert({ ...fields, store_id: storeId }).select("id").single();
        if (err) throw err;
        productId = data.id;
      }
      const keep = new Set(variants.filter((v) => v.id).map((v) => v.id));
      for (const old of product?.product_variants ?? []) {
        if (!keep.has(old.id)) {
          const { error: err } = await supabase.from("product_variants").delete().eq("id", old.id);
          if (err) throw err;
        }
      }
      for (const v of variants) {
        const row = { label: v.label, stock_quantity: v.stock, price_cents: v.price };
        const { error: err } = v.id
          ? await supabase.from("product_variants").update(row).eq("id", v.id)
          : await supabase.from("product_variants").insert({ ...row, store_id: storeId, product_id: productId! });
        if (err) throw err;
      }
      await onSaved();
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <Modal title={product ? t("catalog.editTitle") : t("catalog.newTitle")} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="pname">{t("catalog.name")}</label>
          <input id="pname" className="input" value={draft.name} maxLength={120} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="pdesc">{t("catalog.description")}</label>
          <textarea id="pdesc" className="input" style={{ minHeight: 72 }} maxLength={500} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="palias">{t("catalog.aliases")}</label>
          <input id="palias" className="input" maxLength={300} value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} />
          <p className="muted text-sm mt-1 mb-0">{t("catalog.aliasesHelp")}</p>
        </div>
        <div>
          <label className="label" htmlFor="pprice">{t("catalog.price")} ({currency})</label>
          <input id="pprice" className="input" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} dir="ltr" />
        </div>

        <div>
          <div className="label">{t("catalog.variants")}</div>
          <div className="flex flex-col gap-3">
            {draft.variants.map((v) => (
              <div key={v.key} className="rounded-xl p-3 grid gap-2 grid-cols-2" style={{ background: "var(--bg)" }}>
                <div className="col-span-2">
                  <label className="label" htmlFor={`l-${v.key}`}>{t("catalog.variantLabel")}</label>
                  <input id={`l-${v.key}`} className="input" value={v.label} maxLength={60} onChange={(e) => setVariant(v.key, { label: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor={`s-${v.key}`}>{t("catalog.stock")}</label>
                  <input id={`s-${v.key}`} className="input" inputMode="numeric" value={v.stock} onChange={(e) => setVariant(v.key, { stock: e.target.value })} dir="ltr" />
                </div>
                <div>
                  <label className="label" htmlFor={`p-${v.key}`}>{t("catalog.priceOverride")}</label>
                  <input id={`p-${v.key}`} className="input" inputMode="decimal" value={v.price} onChange={(e) => setVariant(v.key, { price: e.target.value })} dir="ltr" />
                </div>
                {draft.variants.length > 1 && (
                  <button type="button" className="btn btn-small btn-danger col-span-2"
                    onClick={() => setDraft((d) => ({ ...d, variants: d.variants.filter((x) => x.key !== v.key) }))}>
                    {t("catalog.removeVariant")}
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-small mt-3"
            onClick={() => setDraft((d) => ({ ...d, variants: [...d.variants, { key: newKey(), label: "", stock: "0", price: "" }] }))}>
            + {t("catalog.addVariant")}
          </button>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> {t("catalog.active")}
        </label>

        {error && <p className="error m-0" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" disabled={busy}>{t("common.save")}</button>
        </div>
      </form>
    </Modal>
  );
}
