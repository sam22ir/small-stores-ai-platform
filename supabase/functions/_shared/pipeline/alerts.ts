import { notifyOwner } from "../telegram.ts";
import type { OrderPort } from "../agent/types.ts";
import type { HandleInboundInput, OwnerAlert } from "./types.ts";

// --- Owner alerts -----------------------------------------------------------
// Each alert is a short Arabic + French line (the store has no language setting yet).

// Records each placed order (not duplicates) so the owner hears about it once.
export function announceOrders(port: OrderPort, alerts: OwnerAlert[]): OrderPort {
  return {
    quoteDelivery: (storeId, wilaya) => port.quoteDelivery(storeId, wilaya),
    async placeOrder(orderInput) {
      const result = await port.placeOrder(orderInput);
      if (result.ok && !result.duplicate) {
        alerts.push({ kind: "order", total_cents: result.total_cents });
      }
      return result;
    },
  };
}

function alertText(
  alert: OwnerAlert,
  storeName: string,
  currency: string,
  who: string,
  link: string | null,
): string {
  let line: string;
  switch (alert.kind) {
    case "handoff":
      line = `${who} : besoin de votre réponse / تحتاج ردّكم` +
        (alert.reason ? ` (${alert.reason.slice(0, 120)})` : "");
      break;
    case "limit":
      line = `${who} : limite mensuelle atteinte, à vous / تم بلوغ الحد الشهري، الرد لكم`;
      break;
    case "token_cap":
      line = `${who} : limite mensuelle de tokens IA atteinte, à vous / تم بلوغ حد الذكاء الاصطناعي الشهري، الرد لكم`;
      break;
    case "billing":
      line = `${who} : abonnement expiré, à vous / انتهى الاشتراك، الرد لكم`;
      break;
    case "degraded":
      line = `${who} : assistant indisponible, à vous de répondre / المساعد غير متاح، ردّكم مطلوب`;
      break;
    case "order":
      line = `Nouvelle commande de ${who} : ${Math.round(alert.total_cents / 100)} ${currency} / طلب جديد من ${who}`;
      break;
  }
  return `[${storeName}] ${line}` + (link ? `\n${link}` : "");
}

// Fire and forget: the reply is already stored and must not wait for an owner alert. The promise is
// handed to EdgeRuntime.waitUntil when available so the isolate isn't shut down mid-send.
export function sendOwnerAlerts(input: HandleInboundInput, alerts: OwnerAlert[]): void {
  const work = sendOwnerAlertsNow(input, alerts);
  (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work);
}

async function sendOwnerAlertsNow(input: HandleInboundInput, alerts: OwnerAlert[]): Promise<void> {
  if (!alerts.length) return;
  return (async () => {
    try {
      const { data } = await input.db
        .from("customers")
        .select("display_name")
        .eq("id", input.customerId)
        .maybeSingle();
      const who = (data?.display_name as string | undefined) || "Un client / عميل";
      const base = input.env("DASHBOARD_URL")?.replace(/\/+$/, "");
      const link = base ? `${base}/inbox/${input.conversation.id}` : null;
      const notify = input.notify ??
        ((storeId: string, text: string) => notifyOwner(input.db, input.env, storeId, text));
      for (const alert of alerts) {
        await notify(
          input.store.id,
          alertText(alert, input.store.name, input.store.currency, who, link),
        );
      }
    } catch (err) {
      console.error("owner alert failed", err instanceof Error ? err.message : "unknown");
    }
  })();
}
