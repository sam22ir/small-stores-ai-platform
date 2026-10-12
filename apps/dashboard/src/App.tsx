import { lazy, Suspense } from "react";
import type { ComponentType } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { I18nProvider } from "./lib/i18n";
import { AppShellSkeleton } from "./components/AppShellSkeleton";
import { NotFound } from "./pages/NotFound";

// Every route is its own chunk, so the public landing page never loads dashboard code.
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(async () => ({ default: (await load())[name] }));
}

// Auth, the Supabase client and the store live in one module. Only the auth and app routes load it,
// so the landing page (/, /fr, /en) downloads none of it.
const authModule = () => import("./AuthScope");
const AuthScope = lazy(() => authModule().then((m) => ({ default: m.AuthScope })));
const Protected = lazy(() => authModule().then((m) => ({ default: m.Protected })));
const WithStore = lazy(() => authModule().then((m) => ({ default: m.WithStore })));

const LandingRoute = lazy(() => import("./pages/landing/Landing").then((m) => ({ default: m.LandingRoute })));
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
const Insights = page(() => import("./pages/Insights"), "Insights");
const Assistant = page(() => import("./pages/Assistant"), "Assistant");
const Legal = {
  Privacy: page(() => import("./pages/Legal"), "Privacy"),
  Terms: page(() => import("./pages/Legal"), "Terms"),
  DataDeletion: page(() => import("./pages/Legal"), "DataDeletion"),
};

export function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <Suspense fallback={<AppShellSkeleton />}>
          <Routes>
            {/* Public landing page: Arabic at the root, French and English under their own paths. */}
            <Route path="/" element={<LandingRoute locale="ar" />} />
            <Route path="/fr" element={<LandingRoute locale="fr" />} />
            <Route path="/en" element={<LandingRoute locale="en" />} />
            <Route path="/privacy" element={<Legal.Privacy />} />
            <Route path="/terms" element={<Legal.Terms />} />
            <Route path="/data-deletion" element={<Legal.DataDeletion />} />
            <Route path="*" element={<NotFound />} />
            <Route element={<AuthScope />}>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              {/* The recovery link lands here, and the guard must not send it to /login first. */}
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<Protected />}>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route element={<WithStore />}>
                  <Route path="/inbox" element={<Inbox />}>
                    <Route index element={<InboxEmpty />} />
                    <Route path=":id" element={<Thread />} />
                  </Route>
                  <Route path="/catalog" element={<Catalog />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/insights" element={<Insights />} />
                  <Route path="/assistant" element={<Assistant />} />
                  <Route path="/channels" element={<Navigate to="/assistant" replace />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </I18nProvider>
    </BrowserRouter>
  );
}
