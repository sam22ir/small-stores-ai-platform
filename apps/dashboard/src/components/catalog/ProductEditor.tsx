import { useState } from "react";
import type { FormEvent } from "react";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, Input, Label, Switch, TextArea, TextField } from "@heroui/react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../lib/motion";
import { centsToInput, parsePrice, parseStock } from "../../lib/format";
import type { Product, SaveVariant } from "../../lib/catalog";
import { Modal } from "../Modal";

type VDraft = { key: string; id?: string; label: string; stock: string; price: string };
type Draft = { id?: string; name: string; description: string; aliases: string; price: string; active: boolean; variants: VDraft[] };

let seq = 0;
const newKey = () => `v${++seq}`;

function toDraft(p?: Product, defaultLabel = "Default"): Draft {
  if (!p) return { name: "", description: "", aliases: "", price: "", active: true, variants: [{ key: newKey(), label: defaultLabel, stock: "0", price: "" }] };
  return {
    id: p.id, name: p.name, description: p.description ?? "", aliases: p.aliases ?? "", price: centsToInput(p.price_cents), active: p.active,
    variants: p.product_variants.map((v) => ({ key: newKey(), id: v.id, label: v.label, stock: String(v.stock_quantity), price: centsToInput(v.price_cents) })),
  };
}

// Add or edit a product with its options. One save_product call writes the product and its options
// in one transaction, so a failed save changes nothing and a retry is safe.
export function ProductEditor({ product, currency, storeId, onClose, onSaved }: {
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
    const variants: SaveVariant[] = [];
    for (const v of draft.variants) {
      const label = v.label.trim();
      if (!label) return setError(t("catalog.errLabel"));
      const stock = parseStock(v.stock);
      if (stock === null) return setError(t("catalog.errStock"));
      const vp = v.price.trim() === "" ? null : parsePrice(v.price);
      if (v.price.trim() !== "" && vp === null) return setError(t("catalog.errPrice"));
      variants.push({ id: v.id, label, stock_quantity: stock, price_cents: vp });
    }

    setBusy(true);
    try {
      const { error: err } = await supabase.rpc("save_product", {
        p_store_id: storeId,
        p_product_id: product?.id ?? null,
        p_product: {
          name, description: draft.description.trim() || null, aliases: draft.aliases.trim() || null,
          price_cents: price, active: draft.active,
        },
        p_variants: variants,
      });
      if (err) throw err;
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
