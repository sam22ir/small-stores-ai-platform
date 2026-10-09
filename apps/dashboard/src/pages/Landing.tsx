import { useEffect, useState } from "react";
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

const FEATURES: { t: TKey; b: TKey }[] = [
  { t: "landing.features.1.t", b: "landing.features.1.b" },
  { t: "landing.features.2.t", b: "landing.features.2.b" },
  { t: "landing.features.3.t", b: "landing.features.3.b" },
  { t: "landing.features.4.t", b: "landing.features.4.b" },
];

const STEPS: { t: TKey; b: TKey }[] = [
  { t: "landing.how.1.t", b: "landing.how.1.b" },
  { t: "landing.how.2.t", b: "landing.how.2.b" },
  { t: "landing.how.3.t", b: "landing.how.3.b" },
];

const css = `
.lp-bubble { animation: lp-in .35s ease both; }
@keyframes lp-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.lp-tab[aria-selected="true"] { background: var(--brand); color: var(--brand-contrast); border-color: var(--brand); }
@media (prefers-reduced-motion: reduce) { .lp-bubble { animation: none; } }
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

  return (
    <div className="card" style={{ padding: "1rem", display: "grid", gap: "1rem" }}>
      <div role="tablist" style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
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
      <div style={{ display: "grid", gap: ".6rem", minHeight: 220, alignContent: "start" }} aria-live="polite">
        {scenario.lines.slice(0, shown).map((line, i) => {
          const mine = line.who === "customer";
          return (
            <div
              key={`${scenario.id}-${i}`}
              className="lp-bubble"
              style={{
                justifySelf: mine ? "start" : "end",
                maxWidth: "82%",
                background: mine ? "var(--surface-2)" : "var(--brand-soft)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: ".55rem .8rem",
              }}
            >
              <div className="muted" style={{ fontSize: ".75rem", marginBottom: 2 }}>{label[line.who]}</div>
              <div>{t(line.key)}</div>
            </div>
          );
        })}
      </div>
      {shown >= scenario.lines.length && (
        <button className="btn btn-small" style={{ justifySelf: "start" }} onClick={() => setShown(0)}>
          {t("landing.demo.replay")}
        </button>
      )}
    </div>
  );
}

export function Landing() {
  const { t } = useI18n();
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <style>{css}</style>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: ".75rem",
          padding: "0.75rem 16px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ color: "var(--heading)" }}>{t("app.name")}</strong>
        <nav style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <a href="#features">{t("landing.nav.features")}</a>
          <a href="#how">{t("landing.nav.how")}</a>
          <LangSwitch />
          <Link className="btn btn-small" to="/login">{t("landing.nav.login")}</Link>
        </nav>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "0 16px", display: "grid", gap: "4rem" }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "2.5rem",
            alignItems: "center",
            paddingTop: "3.5rem",
          }}
        >
          <div style={{ display: "grid", gap: "1.1rem" }}>
            <span className="muted" style={{ textTransform: "uppercase", letterSpacing: ".08em", fontSize: ".8rem" }}>
              {t("landing.hero.eyebrow")}
            </span>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: 1.1, margin: 0, color: "var(--heading)" }}>
              {t("landing.hero.title")}
            </h1>
            <p className="muted" style={{ fontSize: "1.1rem", margin: 0 }}>{t("landing.hero.sub")}</p>
            <div>
              <Link className="btn btn-primary" to="/login">{t("landing.hero.cta")}</Link>
            </div>
          </div>
          <ChatDemo />
        </section>

        <section id="how" style={{ display: "grid", gap: "1.25rem" }}>
          <h2 style={{ margin: 0, color: "var(--heading)", fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>{t("landing.how.title")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            {STEPS.map((s, i) => (
              <div key={s.t} className="card" style={{ padding: "1.1rem", display: "grid", gap: ".4rem" }}>
                <span style={{ color: "var(--brand)", fontWeight: 700 }}>{String(i + 1).padStart(2, "0")}</span>
                <strong>{t(s.t)}</strong>
                <span className="muted">{t(s.b)}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="features" style={{ display: "grid", gap: "1.25rem" }}>
          <h2 style={{ margin: 0, color: "var(--heading)", fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>{t("landing.features.title")}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
            {FEATURES.map((f) => (
              <div key={f.t} className="card" style={{ padding: "1.1rem", display: "grid", gap: ".4rem" }}>
                <strong>{t(f.t)}</strong>
                <span className="muted">{t(f.b)}</span>
              </div>
            ))}
          </div>
        </section>

        <section
          className="card"
          style={{ padding: "2rem 1.25rem", textAlign: "center", display: "grid", gap: "1rem", justifyItems: "center" }}
        >
          <h2 style={{ margin: 0, color: "var(--heading)", fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>{t("landing.cta.title")}</h2>
          <Link className="btn btn-primary" to="/login">{t("landing.cta.btn")}</Link>
        </section>
      </main>

      <footer className="muted" style={{ textAlign: "center", padding: "2.5rem 16px", fontSize: ".85rem", display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
        <span>{t("landing.footer")}</span>
        <Link to="/privacy">{t("landing.footer.privacy")}</Link>
        <Link to="/terms">{t("landing.footer.terms")}</Link>
      </footer>
    </div>
  );
}
