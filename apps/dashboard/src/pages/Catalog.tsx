import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FormEvent, ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, Chip, Input, Label, Skeleton, Switch, TextArea, TextField } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { Modal } from "../components/Modal";
import { ImportModal } from "../components/ImportModal";
import { useSetupData } from "../lib/setup";
import { RouteButton } from "../components/wakil/RouteLink";
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

// Small pop-in for status chips ("Sold out today", stock badges).
function Pop({ children }: { children: ReactNode }) {
  const reduced = useMotionSafe();
  return (
    <m.span
      className="inline-flex"
      initial={reduced ? false : { scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: dur.short, ease: ease.stamp }}
    >
      {children}
    </m.span>
  );
}

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

// Stock number with a tick when it changes and a check that flashes after a saved change.
function StockStepper({ v, onStep, t }: { v: Variant; onStep: (delta: number) => Promise<boolean>; t: (k: "catalog.decrease" | "catalog.increase") => string }) {
  const reduced = useMotionSafe();
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function step(delta: number) {
    const ok = await onStep(delta);
    if (!ok) return;
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button isIconOnly variant="outline" size="sm" className="rounded-full" aria-label={t("catalog.decrease")} onPress={() => void step(-1)}>−</Button>
      <span className="relative min-w-10 text-center" aria-live="polite">
        <AnimatePresence initial={false} mode="popLayout">
          <m.span
            key={v.stock_quantity}
            className="block font-semibold text-[15px] tabular-nums"
            initial={reduced ? false : { y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? undefined : { y: 8, opacity: 0, position: "absolute", inset: 0 }}
            transition={{ duration: dur.micro, ease: ease.out }}
          >
            {v.stock_quantity}
          </m.span>
        </AnimatePresence>
      </span>
      <AnimatePresence>
        {saved && (
          <m.span key="saved" aria-hidden="true" className="text-success text-sm font-bold"
            initial={reduced ? false : { scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: dur.short, ease: ease.stamp }}>✓</m.span>
        )}
      </AnimatePresence>
      <Button isIconOnly variant="outline" size="sm" className="rounded-full" aria-label={t("catalog.increase")} onPress={() => void step(1)}>+</Button>
    </div>
  );
}

export function Catalog() {
  const { t, lang } = useI18n();
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
    // Optimistic: show the new number now, roll back if the save fails.
    setProducts((all) => all && all.map((x) => x.id !== p.id ? x : { ...x, product_variants: x.product_variants.map((y) => y.id === v.id ? { ...y, stock_quantity: next, updated_at: new Date().toISOString() } : y) }));
    const { error } = await supabase.from("product_variants").update({ stock_quantity: next }).eq("id", v.id);
    if (error) { await load(); return false; }
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

  const staleIds = (products ?? []).filter(isStale).map((p) => p.id);

  const stockChip = (n: number) =>
    n <= 0 ? <Chip size="sm" variant="soft" color="danger"><Chip.Label>{t("catalog.out")}</Chip.Label></Chip>
      : n <= LOW_STOCK ? <Chip size="sm" variant="soft" color="warning"><Chip.Label>{t("catalog.low", { n })}</Chip.Label></Chip>
        : <Chip size="sm" variant="soft" color="success"><Chip.Label>{t("catalog.units", { n })}</Chip.Label></Chip>;

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
              <m.li
                key={p.id}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: p.active ? 1 : 0.65, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.96 }}
                transition={{ duration: dur.short, ease: ease.out }}
                className="flex flex-col gap-3 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-extrabold text-ink">{p.name}</div>
                    {p.aliases && <div className="truncate text-[13px] text-soft">{p.aliases}</div>}
                    <div className="mt-1 text-[15px] font-bold">{formatMoney(p.price_cents, currency, lang)}{!p.active && <span className="text-[13px] font-normal text-soft"> · {t("catalog.hidden")}</span>}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onPress={() => setEditing({ product: p })}>{t("common.edit")}</Button>
                    <Button size="sm" variant="ghost" className="text-red" onPress={() => void remove(p)}>{t("common.delete")}</Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Chip size="sm" variant="soft" color="default"><Chip.Label>{t("catalog.updated", { when: formatAgo(new Date(lastTouched(p)).toISOString(), lang) })}</Chip.Label></Chip>
                  {isStale(p) && <Chip size="sm" variant="soft" color="warning"><Chip.Label>{t("catalog.stale")}</Chip.Label></Chip>}
                  <AnimatePresence>
                    {isSoldOut(p) && (
                      <Pop key="sold"><Chip size="sm" variant="soft" color="danger"><Chip.Label>{t("catalog.soldOutBadge")}</Chip.Label></Chip></Pop>
                    )}
                  </AnimatePresence>
                </div>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {p.product_variants.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 rounded-wakil border-2 border-ink/15 bg-paper px-3 py-2">
                      <div className="min-w-0">
                        <span className="text-[15px] font-bold">{v.label}</span>
                        {v.price_cents !== null && <span className="text-[13px] text-soft"> · {formatMoney(v.price_cents, currency, lang)}</span>}
                        <div className="mt-1">{stockChip(v.stock_quantity)}</div>
                      </div>
                      <StockStepper v={v} t={t} onStep={(delta) => adjustStock(p, v, delta)} />
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-3">
                  <Switch isSelected={p.active} onChange={() => void toggleActive(p)} size="sm">
                    <Switch.Control><Switch.Thumb /></Switch.Control>
                    <Switch.Content className="text-[13px] text-soft">{t("catalog.active")}</Switch.Content>
                  </Switch>
                  <div className="flex flex-wrap gap-2">
                    {isStale(p) && <Button size="sm" variant="outline" onPress={() => void markChecked([p.id])}>{t("catalog.markChecked")}</Button>}
                    <Button size="sm" variant="outline" onPress={() => void toggleSoldOut(p)}>
                      {isSoldOut(p) ? t("catalog.backInStock") : t("catalog.soldOutToday")}
                    </Button>
                  </div>
                </div>
              </m.li>
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

function ProductEditor({ product, currency, storeId, onClose, onSaved }: {
  product?: Product; currency: string; storeId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const reduced = useMotionSafe();
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
        <TextField value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} className="w-full">
          <Label>{t("catalog.name")}</Label>
          <Input id="pname" maxLength={120} autoFocus />
        </TextField>
        <TextField value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} className="w-full">
          <Label>{t("catalog.description")}</Label>
          <TextArea id="pdesc" maxLength={500} rows={3} />
        </TextField>
        <TextField value={draft.aliases} onChange={(v) => setDraft({ ...draft, aliases: v })} className="w-full">
          <Label>{t("catalog.aliases")}</Label>
          <Input id="palias" maxLength={300} />
          <span className="text-sm text-soft">{t("catalog.aliasesHelp")}</span>
        </TextField>
        <TextField value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} className="w-full">
          <Label>{t("catalog.price")} ({currency})</Label>
          <Input id="pprice" inputMode="decimal" dir="ltr" />
        </TextField>

        <div className="flex flex-col gap-2">
          <div className="text-sm font-bold text-ink">{t("catalog.variants")}</div>
          <AnimatePresence initial={false}>
            {draft.variants.map((v) => (
              <m.div
                key={v.key}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduced ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: dur.short, ease: ease.out }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-2 rounded-wakil border-2 border-ink/15 bg-paper p-3">
                  <TextField value={v.label} onChange={(val) => setVariant(v.key, { label: val })} className="col-span-2">
                    <Label>{t("catalog.variantLabel")}</Label>
                    <Input id={`l-${v.key}`} maxLength={60} />
                  </TextField>
                  <TextField value={v.stock} onChange={(val) => setVariant(v.key, { stock: val })}>
                    <Label>{t("catalog.stock")}</Label>
                    <Input id={`s-${v.key}`} inputMode="numeric" dir="ltr" />
                  </TextField>
                  <TextField value={v.price} onChange={(val) => setVariant(v.key, { price: val })}>
                    <Label>{t("catalog.priceOverride")}</Label>
                    <Input id={`p-${v.key}`} inputMode="decimal" dir="ltr" />
                  </TextField>
                  {draft.variants.length > 1 && (
                    <Button size="sm" variant="ghost" className="col-span-2 text-red"
                      onPress={() => setDraft((d) => ({ ...d, variants: d.variants.filter((x) => x.key !== v.key) }))}>
                      {t("catalog.removeVariant")}
                    </Button>
                  )}
                </div>
              </m.div>
            ))}
          </AnimatePresence>
          <Button size="sm" variant="outline" className="self-start"
            onPress={() => setDraft((d) => ({ ...d, variants: [...d.variants, { key: newKey(), label: "", stock: "0", price: "" }] }))}>
            + {t("catalog.addVariant")}
          </Button>
        </div>

        <Switch isSelected={draft.active} onChange={(next) => setDraft({ ...draft, active: next })}>
          <Switch.Control><Switch.Thumb /></Switch.Control>
          <Switch.Content>{t("catalog.active")}</Switch.Content>
        </Switch>

        {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onPress={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" isDisabled={busy}>{t("common.save")}</Button>
        </div>
      </form>
    </Modal>
  );
}
