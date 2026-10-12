import { useEffect, useState } from "react";
import { Alert, Button, toast } from "@heroui/react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import { billingView } from "../../lib/billing";
import { CARD, SECTION_TITLE } from "./shared";

// Subscription status and the "Pay" button (Chargily checkout, see supabase/functions/billing-checkout).
// Shown to owners only: the checkout function rejects other members anyway.
export function BillingCard({ store }: { store: { id: string; trial_ends_at: string; paid_until: string | null } }) {
  const { t, lang } = useI18n();
  const { refresh } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = billingView(store);
  const locale = lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-DZ" : "en-GB";
  const date = new Date(view.endsAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  // Chargily sends the owner back with ?billing=success|failed. The webhook may land a moment later.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("billing");
    if (result === "success") { toast.success(t("billing.paidOk")); void refresh(); }
    if (result === "failed") toast.danger(t("billing.paidFailed"));
  }, []);

  async function pay() {
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.functions.invoke("billing-checkout", { body: { store_id: store.id } });
    if (err || !data?.checkout_url) { setError(t("common.error")); setBusy(false); return; }
    window.location.href = data.checkout_url as string;
  }

  const tone = view.status === "active" || view.status === "trial" ? "bg-slip" : "bg-surface-secondary";
  return (
    <section className={CARD}>
      <div>
        <h2 className={SECTION_TITLE}>{t("billing.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("billing.help")}</p>
      </div>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-bold text-ink ${tone}`}>{t(`billing.status.${view.status}`)}</span>
        <span className="text-[13px] text-soft">
          {view.status === "trial" ? t("billing.trialEnds", { date, n: view.daysLeft })
            : view.status === "active" || view.status === "grace" ? t("billing.paidUntil", { date, n: view.daysLeft })
            : t("billing.expiredSince", { date })}
        </span>
      </div>
      {(view.status === "expired" || view.status === "grace") && (
        <p className="m-0 text-[13px] text-soft">{t("billing.expiredNote")}</p>
      )}
      <div>
        <Button variant="primary" isDisabled={busy} onPress={() => void pay()}>{t("billing.pay")}</Button>
      </div>
    </section>
  );
}
