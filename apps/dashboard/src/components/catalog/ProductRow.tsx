import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Button, Chip, Switch } from "@heroui/react";
import { useI18n } from "../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../lib/motion";
import { LOW_STOCK, STALE_DAYS, formatAgo, formatMoney } from "../../lib/format";
import { isSoldOut, isStale, lastTouched } from "../../lib/catalog";
import type { Product, Variant } from "../../lib/catalog";
import { StockStepper } from "./StockStepper";

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

// One product card in the catalog list. Rendered directly inside AnimatePresence in Catalog.
export function ProductRow({ p, currency, onEdit, onRemove, onToggleActive, onMarkChecked, onToggleSoldOut, onStep }: {
  p: Product;
  currency: string;
  onEdit: () => void;
  onRemove: () => void;
  onToggleActive: () => void;
  onMarkChecked: () => void;
  onToggleSoldOut: () => void;
  onStep: (v: Variant, delta: number) => Promise<boolean>;
}) {
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const stale = isStale(p, STALE_DAYS);
  const soldOut = isSoldOut(p);

  const stockChip = (n: number) =>
    n <= 0 ? <Chip size="sm" variant="soft" color="danger"><Chip.Label>{t("catalog.out")}</Chip.Label></Chip>
      : n <= LOW_STOCK ? <Chip size="sm" variant="soft" color="warning"><Chip.Label>{t("catalog.low", { n })}</Chip.Label></Chip>
        : <Chip size="sm" variant="soft" color="success"><Chip.Label>{t("catalog.units", { n })}</Chip.Label></Chip>;

  return (
    <m.li
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: p.active ? 1 : 0.65, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, scale: 0.96 }}
      transition={{ duration: dur.short, ease: ease.out }}
      className="flex flex-col gap-3 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {p.image_url && (
            <img src={p.image_url} alt={p.name} loading="lazy" width={56} height={56}
              className="size-14 shrink-0 rounded-wakil border-2 border-ink/15 object-cover" />
          )}
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold text-ink">{p.name}</div>
            {p.aliases && <div className="truncate text-[13px] text-soft">{p.aliases}</div>}
            <div className="mt-1 text-[15px] font-bold">{formatMoney(p.price_cents, currency, lang)}{!p.active && <span className="text-[13px] font-normal text-soft"> · {t("catalog.hidden")}</span>}</div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" className="min-h-11" onPress={onEdit}>{t("common.edit")}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip size="sm" variant="soft" color="default"><Chip.Label>{t("catalog.updated", { when: formatAgo(new Date(lastTouched(p)).toISOString(), lang) })}</Chip.Label></Chip>
        {stale && <Chip size="sm" variant="soft" color="warning"><Chip.Label>{t("catalog.stale")}</Chip.Label></Chip>}
        <AnimatePresence>
          {soldOut && (
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
            <StockStepper v={v} onStep={(delta) => onStep(v, delta)} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-3">
        <Switch isSelected={p.active} onChange={onToggleActive} size="sm">
          <Switch.Control><Switch.Thumb /></Switch.Control>
          <Switch.Content className="text-[13px] text-soft">{t("catalog.active")}</Switch.Content>
        </Switch>
        <div className="flex flex-wrap items-center gap-2">
          {stale && <Button size="sm" variant="outline" className="min-h-11" onPress={onMarkChecked}>{t("catalog.markChecked")}</Button>}
          <Button size="sm" variant="outline" className="min-h-11" onPress={onToggleSoldOut}>
            {soldOut ? t("catalog.backInStock") : t("catalog.soldOutToday")}
          </Button>
          <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-ink/15 sm:block" />
          <Button size="sm" variant="ghost" className="min-h-11 text-[13px] font-semibold text-red/80" onPress={onRemove}>{t("common.delete")}</Button>
        </div>
      </div>
    </m.li>
  );
}
