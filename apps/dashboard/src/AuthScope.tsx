// Everything that needs Supabase auth and the store. Loaded only for the app and auth routes, never for the landing.
import { lazy } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { useI18n } from "./lib/i18n";
import { StoreProvider, useStore } from "./lib/store";
import { configured } from "./lib/supabase";

const Layout = lazy(() => import("./components/Layout").then((m) => ({ default: m.Layout })));

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center p-6 text-center">{children}</div>;
}

// Wraps the auth and app routes in the auth session.
export function AuthScope() {
  return <AuthProvider><Outlet /></AuthProvider>;
}

export function Protected() {
  const { session, loading } = useAuth();
  const { t } = useI18n();
  if (!configured) return <Centered><p className="error">{t("setup.missing")}</p></Centered>;
  if (loading) return <Centered><p className="muted">{t("common.loading")}</p></Centered>;
  if (!session) return <Navigate to="/login" replace />;
  return (
    <StoreProvider key={session.user.id} userId={session.user.id}>
      <Outlet />
    </StoreProvider>
  );
}

export function WithStore() {
  const { store, loading, failed, refresh } = useStore();
  const { t } = useI18n();
  if (loading) return <Centered><p className="muted">{t("common.loading")}</p></Centered>;
  if (failed) {
    return (
      <Centered>
        <div>
          <p className="error">{t("common.error")}</p>
          <button className="btn mt-3" onClick={() => void refresh()}>{t("common.retry")}</button>
        </div>
      </Centered>
    );
  }
  if (!store) return <Navigate to="/onboarding" replace />;
  return <Layout />;
}
