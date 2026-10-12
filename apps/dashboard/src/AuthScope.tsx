// Everything that needs Supabase auth and the store. Loaded only for the app and auth routes, never for the landing.
import { lazy } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { Alert, Button } from "@heroui/react";
import { AuthProvider, useAuth } from "./lib/auth";
import { useI18n } from "./lib/i18n";
import { StoreProvider, useStore } from "./lib/store";
import { configured } from "./lib/supabase";
import { AppShellSkeleton } from "./components/AppShellSkeleton";
import { importWithReload } from "./lib/chunkReload";

const Layout = lazy(() => importWithReload(() => import("./components/Layout")).then((m) => ({ default: m.Layout })));

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-screen place-items-center p-6 text-center">{children}</div>;
}

// Wraps the auth and app routes in the auth session.
export function AuthScope() {
  return <AuthProvider><Outlet /></AuthProvider>;
}

export function Protected() {
  const { session, loading } = useAuth();
  const { t } = useI18n();
  if (!configured) return <Centered><Alert status="danger"><Alert.Content><Alert.Description>{t("setup.missing")}</Alert.Description></Alert.Content></Alert></Centered>;
  if (loading) return <AppShellSkeleton />;
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
  if (loading) return <AppShellSkeleton />;
  if (failed) {
    return (
      <Centered>
        <div className="flex flex-col items-center gap-3">
          <Alert status="danger"><Alert.Content><Alert.Description>{t("common.error")}</Alert.Description></Alert.Content></Alert>
          <Button variant="outline" onPress={() => void refresh()}>{t("common.retry")}</Button>
        </div>
      </Centered>
    );
  }
  if (!store) return <Navigate to="/onboarding" replace />;
  return <Layout />;
}
