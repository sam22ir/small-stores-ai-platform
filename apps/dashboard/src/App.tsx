import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { I18nProvider, useI18n } from "./lib/i18n";
import { StoreProvider, useStore } from "./lib/store";
import { configured } from "./lib/supabase";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { SignUp } from "./pages/SignUp";
import { ResetPassword } from "./pages/ResetPassword";
import { Onboarding } from "./pages/Onboarding";
import { Inbox, InboxEmpty } from "./pages/Inbox";
import { Thread } from "./pages/Thread";
import { Catalog } from "./pages/Catalog";
import { Settings } from "./pages/Settings";
import { Orders } from "./pages/Orders";
import { Assistant } from "./pages/Assistant";
import { DataDeletion, Privacy, Terms } from "./pages/Legal";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center p-6 text-center">{children}</div>;
}

function Protected() {
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

function WithStore() {
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

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Signed-out visitors are sent to /login by the Protected guard; signed-in users land on the inbox. */}
            <Route path="/" element={<Navigate to="/inbox" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            {/* Outside Protected: the recovery link lands here, and the guard must not send it to /login first. */}
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/data-deletion" element={<DataDeletion />} />
            <Route element={<Protected />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<WithStore />}>
                <Route path="/inbox" element={<Inbox />}>
                  <Route index element={<InboxEmpty />} />
                  <Route path=":id" element={<Thread />} />
                </Route>
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/assistant" element={<Assistant />} />
                <Route path="/channels" element={<Navigate to="/assistant" replace />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
