import { lazy, Suspense } from "react";
import type { ComponentType } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { I18nProvider, useI18n } from "./lib/i18n";
import { StoreProvider, useStore } from "./lib/store";
import { configured } from "./lib/supabase";
import { Landing } from "./pages/landing/Landing";
import { NotFound } from "./pages/NotFound";

// Every route is its own chunk, so the public landing page never loads dashboard code.
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(async () => ({ default: (await load())[name] }));
}

const Layout = page(() => import("./components/Layout"), "Layout");
const Login = page(() => import("./pages/Login"), "Login");
const SignUp = page(() => import("./pages/SignUp"), "SignUp");
const ResetPassword = page(() => import("./pages/ResetPassword"), "ResetPassword");
const Onboarding = page(() => import("./pages/Onboarding"), "Onboarding");
const Inbox = page(() => import("./pages/Inbox"), "Inbox");
const InboxEmpty = page(() => import("./pages/Inbox"), "InboxEmpty");
const Thread = page(() => import("./pages/Thread"), "Thread");
const Catalog = page(() => import("./pages/Catalog"), "Catalog");
const Settings = page(() => import("./pages/Settings"), "Settings");
const Orders = page(() => import("./pages/Orders"), "Orders");
const Assistant = page(() => import("./pages/Assistant"), "Assistant");
const Legal = {
  Privacy: page(() => import("./pages/Legal"), "Privacy"),
  Terms: page(() => import("./pages/Legal"), "Terms"),
  DataDeletion: page(() => import("./pages/Legal"), "DataDeletion"),
};

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
          <Suspense fallback={<Centered><p className="muted">…</p></Centered>}>
            <Routes>
              {/* Public landing page: Arabic at the root, French and English under their own paths. */}
              <Route path="/" element={<Landing locale="ar" />} />
              <Route path="/fr" element={<Landing locale="fr" />} />
              <Route path="/en" element={<Landing locale="en" />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              {/* Outside Protected: the recovery link lands here, and the guard must not send it to /login first. */}
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<Legal.Privacy />} />
              <Route path="/terms" element={<Legal.Terms />} />
              <Route path="/data-deletion" element={<Legal.DataDeletion />} />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
