import { useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { useStore } from "../lib/store";
import { PRODUCTS_TARGET, hideSetup, isSetupHidden, useSetupData } from "../lib/setup";

type Step = {
  id: string;
  title: TKey;
  desc: TKey;
  done: boolean;
  badge?: string;
  optional?: boolean;
  soon?: boolean;
  actions: { to: string; label: TKey }[];
};

// A short list on the Chats page that tells a new owner what to do next. It goes away on its
// own look (a "ready" card) once the required steps are done, and can be hidden.
export function SetupChecklist() {
  const { t } = useI18n();
  const { store } = useStore();
  const { data } = useSetupData();
  const [hidden, setHidden] = useState(() => isSetupHidden(store!.id));
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
    { id: "channel", title: "setup.channel.title", desc: "setup.channel.desc", done: false, optional: true, soon: true, actions: [] },
  ];
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const allDone = done === required.length;
  const nextId = required.find((s) => !s.done)?.id;

  function hide() { hideSetup(store!.id); setHidden(true); }

  if (allDone) {
    return (
      <div className="card p-4 mb-4 flex items-center justify-between gap-3 flex-wrap" role="status">
        <span className="font-semibold">✓ {t("setup.ready")}</span>
        <button className="btn btn-small" onClick={hide}>{t("setup.hide")}</button>
      </div>
    );
  }

  return (
    <section className="card p-4 mb-4" aria-label={t("setup.title")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold m-0">{t("setup.title")}</h2>
        <button className="btn btn-small" onClick={hide}>{t("setup.hide")}</button>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <div className="grow h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }} role="progressbar"
          aria-valuenow={done} aria-valuemin={0} aria-valuemax={required.length}>
          <div className="h-full" style={{ width: `${(done / required.length) * 100}%`, background: "var(--brand)" }} />
        </div>
        <span className="muted text-sm shrink-0">{t("setup.progress", { done, total: required.length })}</span>
      </div>
      <ul className="list-none p-0 mt-3 mb-0 flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s.id} className="rounded-xl px-3 py-2.5 flex items-start gap-3" style={{ background: "var(--bg)", opacity: s.soon ? 0.7 : 1 }}>
            <span aria-hidden="true" className="mt-0.5 shrink-0 grid place-items-center rounded-full text-xs font-bold"
              style={{ width: 22, height: 22, background: s.done ? "var(--ok-bg)" : "var(--border)", color: s.done ? "var(--ok-text)" : "var(--muted)" }}>
              {s.done ? "✓" : ""}
            </span>
            <div className="grow min-w-0">
              <div className={`font-semibold ${s.done ? "line-through muted" : ""}`}>{t(s.title)}
                {s.id === nextId && <span className="badge badge-warn ms-2">{t("setup.next")}</span>}
              </div>
              <div className="muted text-sm">{t(s.desc)}{s.badge && !s.done ? ` · ${s.badge}` : ""}</div>
              {!s.done && s.actions.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {s.actions.map((a, i) => (
                    <Link key={a.to} to={a.to}
                      className={`btn btn-small no-underline ${s.id === nextId && i === 0 ? "btn-primary" : ""}`}
                      style={s.id === nextId && i === 0 ? undefined : { color: "inherit" }}>
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
  );
}
