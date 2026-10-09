import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { LangSwitch } from "./LangSwitch";
import "./auth.css";

// The landing is served from the same Pages site as the dashboard, so "/" is the default.
const DEFAULT_LANDING_URL = "/";

// Landing site URL from the build env, falling back to the same-origin landing.
function landingUrl(): { href: string; host: string } {
  const raw = (import.meta.env.VITE_LANDING_URL as string | undefined)?.trim() || DEFAULT_LANDING_URL;
  try {
    const url = new URL(raw, window.location.href);
    return { href: raw, host: url.host };
  } catch {
    return { href: DEFAULT_LANDING_URL, host: window.location.host };
  }
}

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

// Shared shell for the sign-in and sign-up pages: order slip form on one side,
// ink brand panel on the other. On mobile the brand collapses to a header above the form.
export function AuthLayout({ title, subtitle, children, footer }: Props) {
  const { t } = useI18n();
  const landing = landingUrl();

  return (
    <div className="wk-auth">
      <div className="wk-shell">
        <main className="wk-main">
          <div className="wk-topbar">
            <a className="wk-back" href={landing.href}>
              <span className="wk-arrow" aria-hidden="true">←</span>
              <span dir="ltr">{landing.host}</span>
            </a>
            <LangSwitch />
          </div>

          <div className="wk-slip-wrap">
            <div className="wk-slip">
              <h1 className="wk-title">{title}</h1>
              {subtitle && <p className="wk-sub">{subtitle}</p>}
              {children}
              {footer}
            </div>
          </div>

          <nav className="wk-legal" aria-label="Legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/data-deletion">Data deletion</Link>
          </nav>
        </main>

        <aside className="wk-brand">
          <div className="wk-brand-inner">
            <div className="wk-logo">
              <span className="wk-logo-ar" lang="ar">وكيل</span>
              <span className="wk-logo-latin">Wakil</span>
            </div>
            <p className="wk-brand-line" lang="ar">زبونك يسقسي، وكيل يجاوب</p>
            <div className="wk-brand-detail">
              <p className="wk-brand-value">{t("auth.brandValue")}</p>
              <div className="wk-dm">
                <p className="wk-dm-caption">{t("auth.exampleLabel")}</p>
                <p className="wk-bubble wk-bubble-in" dir="ltr" lang="en">
                  Salam, kayen l'hoodie noir taille M?
                </p>
                <p className="wk-bubble wk-bubble-out" dir="ltr" lang="en">
                  Ih kayen, 3,200 DA. Livraison l Oran 400 DA.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
