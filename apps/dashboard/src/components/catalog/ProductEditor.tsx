import { useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, Input, Label, Switch, TextArea, TextField } from "@heroui/react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../lib/motion";
import { centsToInput, parsePrice, parseStock } from "../../lib/format";
import type { Product, SaveVariant } from "../../lib/catalog";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, photoPathFromUrl, resizeToJpeg } from "../../lib/image";
import { Modal } from "../Modal";

const PHOTO_BUCKET = "product-images";

type VDraft = { key: string; id?: string; label: string; stock: string; price: string };
type Draft = { id?: string; name: string; description: string; aliases: string; price: string; active: boolean; image: string | null; variants: VDraft[] };

let seq = 0;
const newKey = () => `v${++seq}`;

function toDraft(p?: Product, defaultLabel = "Default"): Draft {
  if (!p) return { name: "", description: "", aliases: "", price: "", active: true, image: null, variants: [{ key: newKey(), label: defaultLabel, stock: "0", price: "" }] };
  return {
    id: p.id, name: p.name, description: p.description ?? "", aliases: p.aliases ?? "", price: centsToInput(p.price_cents), active: p.active,
    image: p.image_url ?? null,
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const setVariant = (key: string, patch: Partial<VDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => v.key === key ? { ...v, ...patch } : v) }));

  // Resizes the picked file, uploads it under this store's folder, and keeps the public URL in the draft.
  // The product is not written until Save, so a photo uploaded and then abandoned stays unused in the bucket.
  async function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires onChange
    if (!file) return;
    setPhotoError(null);
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) return setPhotoError(t("catalog.photoErrType"));
    setPhotoBusy(true);
    try {
      const blob = await resizeToJpeg(file);
      if (blob.size > PHOTO_MAX_BYTES) return setPhotoError(t("catalog.photoErrSize"));
      const path = `${storeId}/${crypto.randomUUID()}.jpg`;
      const bucket = supabase.storage.from(PHOTO_BUCKET);
      const { error: upErr } = await bucket.upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      setDraft((d) => ({ ...d, image: bucket.getPublicUrl(path).data.publicUrl }));
    } catch {
      setPhotoError(t("catalog.photoErrUpload"));
    } finally {
      setPhotoBusy(false);
    }
  }

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
          price_cents: price, active: draft.active, image_url: draft.image,
        },
        p_variants: variants,
      });
      if (err) throw err;
      // The photo this product had before is no longer used: remove it, best effort.
      const oldPath = product?.image_url && product.image_url !== draft.image ? photoPathFromUrl(product.image_url) : null;
      if (oldPath) await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]).catch(() => undefined);
      await onSaved();
    } catch {
      setError(t("common.error"));
      setBusy(false);
    }
  }

  return (
    <Modal title={product ? t("catalog.editTitle") : t("catalog.newTitle")} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="text-sm font-bold text-ink">{t("catalog.photo")}</div>
          <div className="flex items-center gap-3">
            {draft.image ? (
              <img src={draft.image} alt="" width={80} height={80} className="size-20 shrink-0 rounded-wakil border-2 border-ink/15 object-cover" />
            ) : (
              <div aria-hidden="true" className="size-20 shrink-0 rounded-wakil border-2 border-dashed border-ink/25" />
            )}
            <div className="flex flex-col items-start gap-2">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                onChange={onPickPhoto} />
              <Button size="sm" variant="outline" isDisabled={photoBusy} onPress={() => fileRef.current?.click()}>
                {draft.image ? t("catalog.photoReplace") : t("catalog.photoAdd")}
              </Button>
              {draft.image && (
                <Button size="sm" variant="ghost" className="text-red" isDisabled={photoBusy}
                  onPress={() => { setPhotoError(null); setDraft((d) => ({ ...d, image: null })); }}>
                  {t("catalog.photoRemove")}
                </Button>
              )}
            </div>
          </div>
          <span className="text-sm text-soft">{t("catalog.photoHelp")}</span>
          {photoBusy && <span role="status" className="text-sm text-soft">{t("catalog.photoUploading")}</span>}
          {photoError && <span role="alert" className="text-sm text-red">{photoError}</span>}
        </div>
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
          <Button type="submit" variant="primary" isDisabled={busy || photoBusy}>{t("common.save")}</Button>
        </div>
      </form>
    </Modal>
  );
}
