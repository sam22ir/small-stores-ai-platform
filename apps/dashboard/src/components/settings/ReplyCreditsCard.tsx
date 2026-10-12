import { useState } from "react";
import { Alert, Button, Spinner, toast } from "@heroui/react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { REPLY_PACKS, formatDa, pricePerReply } from "../../lib/billing";
import { CARD, SECTION_TITLE } from "./shared";

// Reply credit packs: extra replies bought on top of the monthly plan. The checkout sets the price
// server-side, so the client only sends the pack size (see supabase/functions/billing-checkout).
export function ReplyCreditsCard({ store }: { store: { id: string; reply_credits: number } }) {
  const { t, lang } = useI18n();
  const [pendingPack, setPendingPack] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locale = lang === "ar" ? "ar-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-US";

  async function buy(credits: number) {
    setPendingPack(credits); setError(null);
    const { data, error: err } = await supabase.functions.invoke("billing-checkout", { body: { store_id: store.id, pack: String(credits) } });
    if (err || !data?.checkout_url) { setError(t("common.error")); toast.danger(t("common.error")); setPendingPack(null); return; }
    window.location.href = data.checkout_url as string;
  }

  return (
    <section className={CARD} aria-labelledby="sec-reply-credits">
      <div>
        <h2 id="sec-reply-credits" className={SECTION_TITLE}>{t("billing.credits.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("billing.credits.help")}</p>
      </div>
      <p className="m-0 text-sm font-bold text-ink" aria-live="polite">
        {t("billing.credits.balance", { n: formatDa(store.reply_credits, locale) })}
      </p>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        {REPLY_PACKS.map((pack) => (
          <Button
            key={pack.credits}
            variant="secondary"
            isDisabled={pendingPack !== null}
            isPending={pendingPack === pack.credits}
            onPress={() => void buy(pack.credits)}
            className="flex h-auto min-h-16 w-full flex-col items-center gap-1 py-3"
          >
            {pendingPack === pack.credits && <Spinner color="current" size="sm" />}
            <span className="text-[15px] font-extrabold">{t("billing.credits.pack", { n: formatDa(pack.credits, locale) })}</span>
            <span className="text-sm">{t("billing.credits.price", { price: formatDa(pack.price, locale) })}</span>
            <span className="text-[12px] opacity-80">{t("billing.credits.perReply", { price: formatDa(pricePerReply(pack), locale, 2) })}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}
