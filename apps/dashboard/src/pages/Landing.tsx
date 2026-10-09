import { useEffect, useState } from "react";
import type { PointerEvent } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import { LangSwitch } from "../components/LangSwitch";

type Who = "customer" | "bot" | "owner";
type Scenario = { id: "order" | "question" | "handoff"; lines: { who: Who; key: TKey }[] };

const SCENARIOS: Scenario[] = [
  {
    id: "order",
    lines: [
      { who: "customer", key: "landing.demo.order.1" },
      { who: "bot", key: "landing.demo.order.2" },
      { who: "customer", key: "landing.demo.order.3" },
      { who: "bot", key: "landing.demo.order.4" },
    ],
  },
  {
    id: "question",
    lines: [
      { who: "customer", key: "landing.demo.question.1" },
      { who: "bot", key: "landing.demo.question.2" },
    ],
  },
  {
    id: "handoff",
    lines: [
      { who: "customer", key: "landing.demo.handoff.1" },
      { who: "bot", key: "landing.demo.handoff.2" },
      { who: "owner", key: "landing.demo.handoff.3" },
    ],
  },
];

const FEATURES: { t: TKey; b: TKey; n: string }[] = [
  { t: "landing.features.1.t", b: "landing.features.1.b", n: "01" },
  { t: "landing.features.2.t", b: "landing.features.2.b", n: "02" },
  { t: "landing.features.3.t", b: "landing.features.3.b", n: "03" },
  { t: "landing.features.4.t", b: "landing.features.4.b", n: "04" },
];

const STEPS: { t: TKey; b: TKey }[] = [
  { t: "landing.how.1.t", b: "landing.how.1.b" },
  { t: "landing.how.2.t", b: "landing.how.2.b" },
  { t: "landing.how.3.t", b: "landing.how.3.b" },
];

const css = `
.lp-root { --lp-radius: 16px; }
.lp-reveal { animation: lp-rise .7s cubic-bezier(.16,1,.3,1) both; }
.lp-reveal-2 { animation-delay: .12s; }
.lp-reveal-3 { animation-delay: .24s; }
@keyframes lp-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
.lp-bubble { animation: lp-pop .4s cubic-bezier(.16,1,.3,1) both; }
@keyframes lp-pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
.lp-tab { transition: background .2s, color .2s, border-color .2s, transform .15s; }
.lp-tab:active { transform: scale(.97); }
.lp-tab[aria-selected="true"] { background: var(--brand); color: var(--brand-contrast); border-color: var(--brand); }
.lp-card { position: relative; overflow: hidden; transition: transform .25s cubic-bezier(.16,1,.3,1), border-color .25s; }
.lp-card::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .3s;
  background: radial-gradient(260px circle at var(--mx, 50%) var(--my, 0%), var(--brand-soft), transparent 70%);
}
.lp-card:hover { transform: translateY(-3px); border-color: var(--brand-border); }
.lp-card:hover::before { opacity: 1; }
.lp-card > * { position: relative; }
.lp-step { transition: padding .3s cubic-bezier(.16,1,.3,1); }
.lp-step:hover { padding-inline-start: 8px; }
.lp-cta { transition: transform .15s, filter .2s; }
.lp-cta:hover { filter: brightness(1.06); }
.lp-cta:active { transform: scale(.98); }
@media (prefers-reduced-motion: reduce) {
  .lp-reveal, .lp-bubble, .lp-card, .lp-step, .lp-cta { animation: none !important; transition: none !important; }
}
`;

function ChatDemo() {
  const { t } = useI18n();
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [shown, setShown] = useState(0);

  // Reveal one message at a time, restarting whenever the scenario changes.
  useEffect(() => {
    setShown(0);
    const timers: number[] = [];
    scenario.lines.forEach((_, i) => {
      timers.push(window.setTimeout(() => setShown(i + 1), 700 * (i + 1)));
    });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [scenario]);

  const label: Record<Who, string> = {
    customer: t("landing.demo.customer"),
    bot: t("landing.demo.bot"),
    owner: t("landing.demo.owner"),
  };

  const done = shown >= scenario.lines.length;

  return (
    <div
      className="lp-reveal lp-reveal-3"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 24,
        padding: "1.1rem",
        boxShadow: "0 30px 80px -40px rgb(0 0 0 / .35)",
        display: "grid",
        gap: "1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".5rem" }}>
        <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={scenario.id === s.id}
              className="btn btn-small lp-tab"
              onClick={() => setScenario(s)}
            >
              {t(`landing.demo.tab.${s.id}` as TKey)}
            </button>
          ))}
        </div>
      </div>
      <div
        aria-live="polite"
        style={{
          display: "grid",
          gap: ".6rem",
          minHeight: 232,
          alignContent: "start",
          background: "var(--surface-2)",
          borderRadius: 16,
          padding: ".9rem",
        }}
      >
        {scenario.lines.slice(0, shown).map((line, i) => {
          const mine = line.who === "customer";
          return (
            <div
              key={`${scenario.id}-${i}`}
              className="lp-bubble"
              style={{
                justifySelf: mine ? "start" : "end",
                maxWidth: "82%",
                background: mine ? "var(--surface)" : "var(--brand)",
                color: mine ? "var(--text)" : "var(--brand-contrast)",
                border: mine ? "1px solid var(--border)" : "1px solid transparent",
                borderRadius: 16,
                padding: ".55rem .8rem",
              }}
            >
              <div style={{ fontSize: ".72rem", opacity: 0.7, marginBottom: 2 }}>{label[line.who]}</div>
              <div style={{ lineHeight: 1.45 }}>{t(line.key)}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 32 }}>
        <span className="muted" style={{ fontSize: ".8rem" }}>
          {done ? "" : "..."}
        </span>
        {done && (
          <button className="btn btn-small" onClick={() => setShown(0)}>
            {t("landing.demo.replay")}
          </button>
        )}
      </div>
    </div>
  );
}

// Tracks the pointer inside a card and writes it to CSS variables, so the
// spotlight follows the cursor without React re-rendering on every move.
function spotlight(e: PointerEvent<HTMLDivElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export function Landing() {
  const { t } = useI18n();
  return (
    <div className="lp-root" style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)", overflowX: "hidden" }}>
      <style>{css}</style>

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "color-mix(in srgb, var(--bg) 82%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 16px",
            height: 68,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <strong style={{ color: "var(--heading)", display: "flex", alignItems: "center", gap: ".5rem", whiteSpace: "nowrap" }}>
            <span
              aria-hidden
              style={{ width: 10, height: 10, borderRadius: 999, background: "var(--brand)", display: "inline-block" }}
            />
            {t("app.name")}
          </strong>
          <nav style={{ display: "flex", alignItems: "center", gap: "1.1rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a href="#features" className="muted">{t("landing.nav.features")}</a>
            <a href="#how" className="muted">{t("landing.nav.how")}</a>
            <LangSwitch />
            <Link className="btn btn-small" to="/login">{t("landing.nav.login")}</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
        {/* Hero */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
            gap: "3rem",
            alignItems: "center",
            minHeight: "calc(100dvh - 68px)",
            padding: "4rem 0 3rem",
          }}
        >
          <div style={{ display: "grid", gap: "1.4rem" }}>
            <span
              className="lp-reveal"
              style={{
                justifySelf: "start",
                display: "inline-flex",
                alignItems: "center",
                gap: ".4rem",
                padding: ".35rem .8rem",
                borderRadius: 999,
                border: "1px solid var(--brand-border)",
                background: "var(--brand-soft)",
                color: "var(--brand)",
                fontSize: ".85rem",
                fontWeight: 600,
              }}
            >
              {t("landing.hero.eyebrow")}
            </span>
            <h1
              className="lp-reveal lp-reveal-2"
              style={{
                fontSize: "clamp(2.4rem, 6vw, 4.25rem)",
                lineHeight: 1.04,
                letterSpacing: "-0.03em",
                fontWeight: 700,
                margin: 0,
                color: "var(--heading)",
                textWrap: "balance",
              }}
            >
              {t("landing.hero.title")}
            </h1>
            <p
              className="lp-reveal lp-reveal-2 muted"
              style={{ fontSize: "1.15rem", lineHeight: 1.6, margin: 0, maxWidth: "52ch" }}
            >
              {t("landing.hero.sub")}
            </p>
            <div className="lp-reveal lp-reveal-3" style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
              <Link className="btn btn-primary lp-cta" to="/login" style={{ padding: ".75rem 1.3rem" }}>
                {t("landing.hero.cta")}
              </Link>
              <a className="btn lp-cta" href="#how" style={{ padding: ".75rem 1.3rem" }}>
                {t("landing.nav.how")}
              </a>
            </div>
          </div>
          <ChatDemo />
        </section>

        {/* How it works */}
        <section id="how" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: "3rem", padding: "4rem 0", alignItems: "start" }}>
          <h2 style={{ margin: 0, color: "var(--heading)", fontSize: "clamp(1.9rem, 4vw, 2.75rem)", lineHeight: 1.1, letterSpacing: "-0.02em", textWrap: "balance" }}>
            {t("landing.how.title")}
          </h2>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
            {STEPS.map((s, i) => (
              <li
                key={s.t}
                className="lp-step"
                style={{
                  display: "grid",
                  gridTemplateColumns: "3rem 1fr",
                  gap: "1rem",
                  padding: "1.4rem 0",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--brand)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div style={{ display: "grid", gap: ".35rem" }}>
                  <strong style={{ fontSize: "1.1rem" }}>{t(s.t)}</strong>
                  <span className="muted" style={{ lineHeight: 1.6 }}>{t(s.b)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" style={{ display: "grid", gap: "2rem", padding: "2rem 0 4rem" }}>
          <h2 style={{ margin: 0, color: "var(--heading)", fontSize: "clamp(1.9rem, 4vw, 2.75rem)", lineHeight: 1.1, letterSpacing: "-0.02em", textWrap: "balance" }}>
            {t("landing.features.title")}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: "1rem" }}>
            {FEATURES.map((f) => (
              <div
                key={f.t}
                className="lp-card"
                onPointerMove={spotlight}
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "1.35rem",
                  display: "grid",
                  gap: ".6rem",
                  alignContent: "start",
                  minHeight: 190,
                }}
              >
                <span style={{ color: "var(--brand)", fontSize: ".85rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{f.n}</span>
                <strong style={{ fontSize: "1.05rem" }}>{t(f.t)}</strong>
                <span className="muted" style={{ lineHeight: 1.6 }}>{t(f.b)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Final call to action */}
        <section
          style={{
            margin: "0 0 4rem",
            borderRadius: 28,
            padding: "clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 3.5rem)",
            background: "var(--brand)",
            color: "var(--brand-contrast)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
            gap: "1.5rem",
            alignItems: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "clamp(1.8rem, 4vw, 2.6rem)", lineHeight: 1.1, letterSpacing: "-0.02em", textWrap: "balance" }}>
            {t("landing.cta.title")}
          </h2>
          <div style={{ justifySelf: "start" }}>
            <Link className="btn lp-cta" to="/login" style={{ background: "var(--brand-contrast)", color: "var(--brand)", borderColor: "transparent", padding: ".75rem 1.3rem", fontWeight: 600 }}>
              {t("landing.cta.btn")}
            </Link>
          </div>
        </section>
      </main>

      <footer
        className="muted"
        style={{
          borderTop: "1px solid var(--border)",
          padding: "2rem 16px",
          fontSize: ".875rem",
          display: "flex",
          gap: "1rem",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          maxWidth: 1200,
          margin: "0 auto",
        }}
      >
        <span>{t("landing.footer")}</span>
        <span style={{ display: "flex", gap: "1rem" }}>
          <Link to="/privacy">{t("landing.footer.privacy")}</Link>
          <Link to="/terms">{t("landing.footer.terms")}</Link>
        </span>
      </footer>
    </div>
  );
}
