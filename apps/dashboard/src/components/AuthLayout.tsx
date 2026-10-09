import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { Alert, Button, FieldError, Input, Label, Spinner, TextField } from "@heroui/react";
import { useI18n } from "../lib/i18n";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { LangSwitch } from "./LangSwitch";
import { DmBubble } from "./wakil/DmBubble";
import { ZelligeBackground } from "./wakil/ZelligeBackground";

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

// Customer's message and Wakil's reply, played once when the page loads (desktop only).
function DmExchange() {
  const reduced = useMotionSafe();
  const [phase, setPhase] = useState<"in" | "typing" | "reply">(reduced ? "reply" : "in");

  useEffect(() => {
    if (reduced) return;
    const typing = setTimeout(() => setPhase("typing"), 900);
    const reply = setTimeout(() => setPhase("reply"), 2300);
    return () => { clearTimeout(typing); clearTimeout(reply); };
  }, [reduced]);

  return (
    <div className="mt-6 flex flex-col gap-3" dir="ltr">
      <DmBubble variant="in" lang="en" animate>Salam, kayen l'hoodie noir taille M?</DmBubble>
      <AnimatePresence>
        {phase === "typing" && (
          <motion.div
            key="typing"
            className="flex w-fit gap-1.5 rounded-2xl rounded-ee-sm bg-blue px-4 py-3 ms-auto"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur.micro, ease: ease.out }}
            aria-hidden="true"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1.5 rounded-full bg-slip"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {phase === "reply" && (
        <DmBubble variant="out" lang="en" animate>Ih kayen, 3,200 DA. Livraison l Oran 400 DA.</DmBubble>
      )}
    </div>
  );
}

// Ink brand panel. On mobile it collapses into a compact header; the DM exchange shows from desktop up.
function BrandPanel() {
  const { t } = useI18n();
  return (
    <aside className="relative overflow-hidden bg-ink px-5 py-5 text-paper sm:px-8 lg:min-h-dvh lg:rounded-wakil-lg lg:px-12 lg:py-16">
      <div className="flex items-baseline gap-3">
        <span lang="ar" className="text-2xl font-bold leading-none">وكيل</span>
        <span className="text-sm font-semibold tracking-wide text-paper/70">Wakil</span>
      </div>
      <p lang="ar" className="mt-3 text-lg font-semibold leading-snug lg:mt-10 lg:text-3xl">زبونك يسقسي، وكيل يجاوب</p>
      <div className="hidden lg:block">
        <p className="mt-6 max-w-sm text-base leading-relaxed text-paper/80">{t("auth.brandValue")}</p>
        <div className="mt-8 rounded-wakil border border-paper/15 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-paper/60">{t("auth.exampleLabel")}</p>
          <DmExchange />
        </div>
      </div>
    </aside>
  );
}

type LayoutProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

// Shared shell for the sign-in and sign-up pages: a slip-style form card beside the ink brand panel.
// The card slides up on load. RTL follows the document direction.
export function AuthLayout({ title, subtitle, children, footer }: LayoutProps) {
  const landing = landingUrl();
  const reduced = useMotionSafe();

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-paper text-ink">
      <ZelligeBackground />
      <div className="relative mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-6 lg:py-10">
        <BrandPanel />

        <main className="flex flex-col gap-6 px-4 pb-8 pt-4 sm:px-6 lg:px-0">
          <div className="flex items-center justify-between gap-3">
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-wakil-sm text-sm font-semibold text-blue underline-offset-4 hover:underline"
              href={landing.href}
            >
              <span aria-hidden="true" className="inline-block rtl:rotate-180">←</span>
              <span dir="ltr">{landing.host}</span>
            </a>
            <LangSwitch />
          </div>

          <motion.div
            className="w-full max-w-md self-center"
            initial={reduced ? false : { opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.base, ease: ease.out }}
          >
            <section className="rounded-wakil-lg border-2 border-ink bg-slip p-6 shadow-ink sm:p-8">
              <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-soft">{subtitle}</p>}
              <div className="mt-6">{children}</div>
              {footer && <div className="mt-6">{footer}</div>}
            </section>
          </motion.div>

          <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-soft">
            <Link className="rounded-wakil-sm underline-offset-4 hover:underline" to="/privacy">Privacy</Link>
            <Link className="rounded-wakil-sm underline-offset-4 hover:underline" to="/terms">Terms</Link>
            <Link className="rounded-wakil-sm underline-offset-4 hover:underline" to="/data-deletion">Data deletion</Link>
          </nav>
        </main>
      </div>
    </div>
  );
}

// Error or notice under the form. Slides and fades in; errors are announced as alerts, notices as status.
export function FormAlert({ tone, children }: { tone: "danger" | "success"; children: ReactNode }) {
  const reduced = useMotionSafe();
  return (
    <motion.div
      role={tone === "danger" ? "alert" : "status"}
      className="mb-4"
      initial={reduced ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.short, ease: ease.out }}
    >
      <Alert status={tone}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{children}</Alert.Description>
        </Alert.Content>
      </Alert>
    </motion.div>
  );
}

// Shakes an element. Used when a submit is rejected. Skipped under reduced motion.
export function useShake() {
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const reduced = useMotionSafe();
  const shake = () => {
    if (!reduced && scope.current) void animate(scope.current, { x: [0, -8, 8, -6, 6, 0] }, { duration: 0.4, ease: "easeInOut" });
  };
  return { scope, shake };
}

// Eye icon that morphs to eye-off when the password is shown.
function EyeIcon({ shown }: { shown: boolean }) {
  const reduced = useMotionSafe();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.svg
        key={shown ? "off" : "on"}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        initial={reduced ? false : { opacity: 0, rotate: -35, scale: 0.6 }}
        animate={{ opacity: 1, rotate: 0, scale: 1 }}
        exit={{ opacity: 0, rotate: 35, scale: 0.6 }}
        transition={{ duration: dur.micro, ease: ease.out }}
      >
        {shown ? (
          <>
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A9.6 9.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.6 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.5 4.4-1.2" />
          </>
        ) : (
          <>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </motion.svg>
    </AnimatePresence>
  );
}

// Password input with show/hide. Errors use HeroUI FieldError; the span keeps the test hook id.
export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
  required,
  error,
  errorId,
  footer,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number;
  required?: boolean;
  error?: string;
  errorId?: string;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <TextField isRequired={required} isInvalid={!!error} validationBehavior="aria" value={value} onChange={onChange} className="w-full">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          dir="ltr"
          className="w-full pe-12 transition-shadow duration-200"
        />
        <Button
          isIconOnly
          size="sm"
          variant="ghost"
          aria-label={shown ? t("auth.hidePassword") : t("auth.showPassword")}
          aria-pressed={shown}
          onPress={() => setShown((s) => !s)}
          className="absolute end-1.5 top-1/2 -translate-y-1/2"
        >
          <EyeIcon shown={shown} />
        </Button>
      </div>
      {error && <FieldError><span id={errorId}>{error}</span></FieldError>}
      {footer}
    </TextField>
  );
}

// "Check your email" state: an envelope that closes with a red check stamp.
export function CheckEmailNotice({ children }: { children: ReactNode }) {
  const reduced = useMotionSafe();
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <motion.svg
        width="88"
        height="88"
        viewBox="0 0 72 72"
        aria-hidden="true"
        initial={reduced ? false : { opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: dur.base, ease: ease.stamp }}
      >
        <rect x="8" y="18" width="56" height="38" rx="6" fill="var(--color-paper)" stroke="currentColor" strokeWidth="2.5" />
        <motion.path
          d="M10 22 L36 42 L62 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.35, duration: 0.5, ease: ease.out }}
        />
        <motion.circle
          cx="58"
          cy="56"
          r="11"
          fill="var(--color-red)"
          initial={reduced ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.8, duration: dur.short, ease: ease.stamp }}
          style={{ transformOrigin: "58px 56px" }}
        />
        <motion.path
          d="M53 56l3.5 3.5L63 50"
          fill="none"
          stroke="var(--color-slip)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.05, duration: dur.short, ease: ease.out }}
        />
      </motion.svg>
      <p role="status" className="text-base text-ink">{children}</p>
    </div>
  );
}

// Submit button with a spinner while the request runs.
export function SubmitButton({ busy, children, disabled }: { busy: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <Button
      type="submit"
      variant="primary"
      fullWidth
      isDisabled={disabled}
      isPending={busy}
      data-testid="auth-submit"
      className="mt-2 min-h-11 font-semibold transition-transform duration-150 active:scale-[0.98]"
    >
      {({ isPending }) => (
        <>
          {isPending ? <Spinner color="current" size="sm" /> : null}
          {children}
        </>
      )}
    </Button>
  );
}
