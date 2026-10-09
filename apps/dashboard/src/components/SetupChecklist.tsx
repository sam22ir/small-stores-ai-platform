import { useState } from "react";
import { Link } from "react-router-dom";
import { m } from "motion/react";
import { Button, Card } from "@heroui/react";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { PRODUCTS_TARGET, hideSetup, isSetupHidden, useSetupData } from "../lib/setup";

type Step = {
  id: string;
  title: TKey;
  desc: TKey;
  done: boolean;
  badge?: string;
  optional?: boolean;
  actions: { to: string; label: TKey }[];
};

// A short list on the Chats page that tells a new owner what to do next. It goes away on its
// own look (a "ready" card) once the required steps are done, and can be hidden.
export function SetupChecklist() {
  const { t } = useI18n();
  const { store } = useStore();
  const { data } = useSetupData();
  const [hidden, setHidden] = useState(() => isSetupHidden(store!.id));
  const reduced = useMotionSafe();
  if (!data || hidden) return null;

  const infoDone = (store!.business_info ?? "").trim().length >= 20;
  const steps: Step[] = [
    {
      id: "products", title: "setup.products.title", desc: "setup.products.desc", done: data.products >= PRODUCTS_TARGET,
      badge: t("setup.products.count", { n: data.products }),
      actions: [{ to: "/catalog", label: "setup.products.add" }, { to: "/catalog?import=1", label: "setup.products.import" }],
    },
    { id: "info", title: "setup.info.title", desc: "setup.info.desc", done: infoDone, actions: [{ to: "/settings", label: "setup.info.action" }] },
    { id: "test", title: "setup.test.title", desc: "setup.test.desc", done: data.tested, actions: [{ to: "/assistant", label: "setup.test.action" }] },
    { id: "orders", title: "setup.orders.title", desc: "setup.orders.desc", done: store!.orders_enabled, optional: true, actions: [{ to: "/settings", label: "setup.orders.action" }] },
    { id: "channel", title: "setup.channel.title", desc: "setup.channel.desc", done: data.channels > 0, optional: true, actions: [{ to: "/assistant", label: "setup.channel.action" }] },
  ];
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const allDone = done === required.length;
  const nextId = required.find((s) => !s.done)?.id;

  function hide() { hideSetup(store!.id); setHidden(true); }

  if (allDone) {
    return (
      <Card role="status" className="flex flex-row flex-wrap items-center justify-between gap-3 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm">
        <span className="font-bold text-blue">✓ {t("setup.ready")}</span>
        <Button size="sm" variant="outline" onPress={hide}>{t("setup.hide")}</Button>
      </Card>
    );
  }

  return (
    <Card aria-label={t("setup.title")} className="rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm">
      <section aria-label={t("setup.title")} className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-base font-bold text-ink">{t("setup.title")}</h2>
          <Button size="sm" variant="ghost" onPress={hide}>{t("setup.hide")}</Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 grow overflow-hidden rounded-full border border-ink/20 bg-paper" role="progressbar"
            aria-valuenow={done} aria-valuemin={0} aria-valuemax={required.length}>
            <m.div className="h-full origin-left rtl:origin-right rounded-full bg-blue" style={{ width: "100%" }}
              initial={reduced ? false : { scaleX: 0 }} animate={{ scaleX: done / required.length }}
              transition={{ duration: dur.slow, ease: ease.out }} />
          </div>
          <span className="shrink-0 text-sm text-soft">{t("setup.progress", { done, total: required.length })}</span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {steps.map((s) => (
            <li key={s.id} className="flex items-start gap-3 rounded-wakil border border-ink/15 bg-paper/60 px-3 py-2.5">
              <span aria-hidden="true" className={`mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-blue text-slip" : "border-2 border-ink/30 bg-slip text-soft"}`}>
                {s.done ? "✓" : ""}
              </span>
              <div className="min-w-0 grow">
                <div className={`font-semibold text-ink ${s.done ? "text-soft line-through" : ""}`}>{t(s.title)}
                  {s.id === nextId && <span className="ms-2 inline-flex rounded-full border border-ink bg-red px-2 py-0.5 text-[11px] font-bold text-slip">{t("setup.next")}</span>}
                </div>
                <div className="text-sm text-soft">{t(s.desc)}{s.badge && !s.done ? ` · ${s.badge}` : ""}</div>
                {!s.done && s.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.actions.map((a, i) => (
                      <Link key={a.to} to={a.to}
                        className={`inline-flex min-h-9 items-center rounded-full border-2 px-3.5 text-[13px] font-semibold no-underline ${s.id === nextId && i === 0 ? "border-ink bg-ink text-slip" : "border-ink/30 text-ink hover:bg-ink/5"}`}>
                        {t(a.label)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  );
}
