import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, Input, Skeleton } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { ImportModal } from "../components/ImportModal";
import { ProductEditor } from "../components/catalog/ProductEditor";
import { ProductRow } from "../components/catalog/ProductRow";
import { useSetupData } from "../lib/setup";
import { RouteButton } from "../components/wakil/RouteLink";
import { STALE_DAYS } from "../lib/format";
import { isSoldOut, isStale } from "../lib/catalog";
import type { Product, Variant } from "../lib/catalog";

// Today's end, as an ISO time: "Sold out today" hides a product until then.
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.toISOString(); };

// Loading state for the product list.
function ListSkeleton() {
  return (
    <div className="grid gap-3 lg:grid-cols-2" aria-hidden="true">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-wakil-lg border-2 border-ink/10 bg-slip p-4">
          <Skeleton className="h-4 w-2/5 rounded-full" />
          <Skeleton className="h-3 w-1/4 rounded-full" />
          <Skeleton className="h-12 w-full rounded-wakil" />
        </div>
      ))}
    </div>
  );
}

export function Catalog() {
  const { t } = useI18n();
  const reduced = useMotionSafe();
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

  async function adjustStock(p: Product, v: Variant, delta: number): Promise<boolean> {
    const next = Math.max(0, v.stock_quantity + delta);
    if (next === v.stock_quantity) return false;
    const setStock = (qty: number) =>
      setProducts((all) => all && all.map((x) => x.id !== p.id ? x : { ...x, product_variants: x.product_variants.map((y) => y.id === v.id ? { ...y, stock_quantity: qty, updated_at: new Date().toISOString() } : y) }));
    // Optimistic: show the new number now. The server floors at zero and returns the number it stored.
    setStock(next);
    const { data, error } = await supabase.rpc("adjust_stock", { p_variant_id: v.id, p_delta: delta });
    if (error) { await load(); return false; }
    setStock(Number(data));
    return true;
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

  const staleIds = (products ?? []).filter((p) => isStale(p, STALE_DAYS)).map((p) => p.id);

  return (
    <m.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
    >
      <div className="mb-4 mt-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[22px] font-extrabold text-ink">{t("catalog.title")}</h1>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" onPress={() => setImporting(true)}>{t("catalog.import")}</Button>
          <Button size="sm" variant="primary" onPress={() => setEditing({})}>+ {t("catalog.add")}</Button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {products && products.length > 0 && setup && !setup.tested && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-wakil-lg border-2 border-ink bg-blue/10 px-4 py-3 shadow-ink-sm" role="status">
            <span className="text-sm font-bold text-ink">{t("catalog.tryNudge")}</span>
            <RouteButton to="/assistant" size="sm" variant="primary">{t("catalog.tryNow")}</RouteButton>
          </div>
        )}
        {staleIds.length > 0 && (
          <Alert status="warning" className="border-2 border-ink">
            <Alert.Content>
              <Alert.Description className="flex flex-wrap items-center justify-between gap-3">
                <span>{t("catalog.staleBanner", { n: staleIds.length })}</span>
                <Button size="sm" variant="outline" onPress={() => void markChecked(staleIds)}>{t("catalog.markAllChecked")}</Button>
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder={t("catalog.search")} aria-label={t("catalog.search")} className="w-full" />
      </div>

      <div className="mt-4">
        {failed && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{t("common.error")} <Button size="sm" variant="outline" onPress={() => void load()}>{t("common.retry")}</Button></Alert.Description></Alert.Content></Alert>}
        {!products && !failed && <ListSkeleton />}
        {products && products.length === 0 && (
          <div className="rounded-wakil-lg border-2 border-ink bg-slip p-6 text-center">
            <p className="m-0 font-bold text-ink">{t("catalog.empty")}</p>
          </div>
        )}
        {products && products.length > 0 && shown.length === 0 && <p className="text-soft">{t("catalog.noMatch")}</p>}

        <ul className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
          <AnimatePresence initial={false}>
            {shown.map((p) => (
              <ProductRow
                key={p.id}
                p={p}
                currency={currency}
                onEdit={() => setEditing({ product: p })}
                onRemove={() => void remove(p)}
                onToggleActive={() => void toggleActive(p)}
                onMarkChecked={() => void markChecked([p.id])}
                onToggleSoldOut={() => void toggleSoldOut(p)}
                onStep={(v, delta) => adjustStock(p, v, delta)}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>

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
    </m.div>
  );
}
