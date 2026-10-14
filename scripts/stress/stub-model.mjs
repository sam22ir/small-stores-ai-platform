// Deterministic stand-in for the OpenAI-compatible model, used by --stub. No network, no key.
// It is not a model and says nothing about answer quality. It only walks the same tool path a
// model would: search_products, then quote_delivery, then either the order summary (details turn,
// total = price + fee) or create_order on the customer's confirmation (with the variant_id it read
// from the search result), or handoff_to_owner. Every reply ends with "(stub)".

const ORDER_WORDS = /commande|je prends|je veux|je confirme|confirme/i;
const HANDOFF_WORDS = /humain|human|propri[ée]taire|owner|responsable|vrai personne/i;
const LABELS = /\b(41|42|43|38|40|L|M|XL|Unique)\b/i;
const PHONE = /\b0[567]\d{8}\b/;
const PHOTO_WORDS = /photo|image|tswira|sowar|صورة/i;
const CONFIRM_WORDS = /\b(confirm\w*|oui|yes|iyeh|nakedh)\b/i;

// "DZD 3,500.00" or "3500 DA" -> 3500. "not set" and missing values count as 0.
const moneyOf = (s) => {
  const m = typeof s === "string" ? s.replace(/,/g, "").match(/\d+(?:\.\d+)?/) : null;
  return m ? Number(m[0]) : 0;
};

const norm = (s) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

function textOf(m) {
  if (!m) return "";
  if (typeof m.content === "string") return m.content;
  return (m.content ?? []).filter((p) => p.type === "text").map((p) => p.text).join("\n");
}

function parseIntent(msgs, fixture) {
  const userTexts = msgs.filter((m) => m.role === "user").map(textOf);
  const latest = userTexts.at(-1) ?? "";
  const all = norm(userTexts.join(" \n "));
  const latestN = norm(latest);

  const field = (label, text = latest) => {
    const m = text.match(new RegExp(`${label}\\s*:\\s*([^,\\n]+)`, "i"));
    return m ? m[1].trim() : null;
  };

  const wilayas = (fixture.delivery_fees ?? []).map((f) => f.wilaya).sort((a, b) => b.length - a.length);
  const wilaya = wilayas.find((w) => all.includes(norm(w))) ?? null;

  let product = null;
  for (const p of fixture.products) {
    const words = [p.name, ...(p.aliases ?? "").split(",")].map((s) => s.trim()).filter(Boolean);
    const hit = words.find((w) => all.includes(norm(w)));
    if (hit) {
      product = { name: p.name, alias: hit };
      break;
    }
  }

  const label = all.match(LABELS);
  // Details can come in an earlier turn than the confirmation: take the last value from any customer turn.
  const lastOf = (re) => userTexts.map((t) => t.match(re)?.[1] ?? t.match(re)?.[0] ?? null).filter(Boolean).at(-1) ?? null;
  const phone = lastOf(PHONE);
  const confirm = CONFIRM_WORDS.test(latestN);
  return {
    photo: PHOTO_WORDS.test(latestN),
    handoff: HANDOFF_WORDS.test(latest),
    confirm,
    order: !!phone && (ORDER_WORDS.test(latestN) || confirm),
    phone,
    name: userTexts.map((t) => field.call(null, "nom", t)).filter(Boolean).at(-1) ?? null,
    address: userTexts.map((t) => field.call(null, "adresse", t)).filter(Boolean).at(-1) ?? null,
    wilaya,
    product,
    variantLabel: label ? label[1] : null,
  };
}

function completion({ content = null, toolCall = null, promptText = "", fallbackTokens = 1 }) {
  const message = toolCall
    ? {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: toolCall.id,
        type: "function",
        function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) },
      }],
    }
    : { role: "assistant", content };
  const outText = toolCall ? JSON.stringify(toolCall.args) : content ?? "";
  return {
    id: "stub-completion",
    object: "chat.completion",
    choices: [{ index: 0, message, finish_reason: toolCall ? "tool_calls" : "stop" }],
    usage: {
      prompt_tokens: Math.max(1, Math.round(promptText.length / 4)),
      completion_tokens: Math.max(fallbackTokens, Math.round(outText.length / 4)),
    },
  };
}

// The body is an OpenAI chat/completions request. Returns a completion object.
export function stubCompletion(body, fixture) {
  const msgs = body.messages ?? [];
  const promptText = JSON.stringify(msgs);
  const text = (content) => completion({ content: `${content} (stub)`, promptText });

  // Requests without tools (the Latin-Darija rewrite, or the probe) get an echo.
  if (!body.tools?.length) return completion({ content: textOf(msgs.at(-1)) || "ok", promptText });

  const lastUser = msgs.findLastIndex((m) => m.role === "user");
  const inRun = msgs.slice(lastUser + 1);
  const calls = inRun.filter((m) => m.role === "assistant" && m.tool_calls).flatMap((m) => m.tool_calls);
  const names = new Map(calls.map((c) => [c.id, c.function.name]));
  const called = calls.map((c) => c.function.name);
  const intent = parseIntent(msgs, fixture);
  const nextId = `stub_call_${calls.length + 1}`;
  const toolCall = (name, args) => completion({ toolCall: { id: nextId, name, args }, promptText });

  if (called.length === 0) {
    if (intent.handoff) {
      return toolCall("handoff_to_owner", {
        reason: "Customer asked for the owner",
        summary: "Customer asked to talk to a person.",
      });
    }
    if (intent.order && (!intent.name || !intent.address)) {
      return text("Merci. Quel est votre nom complet et l'adresse de livraison ?");
    }
    if (intent.photo && intent.product) {
      return toolCall("send_product_photo", { product_name: intent.product.name });
    }
    if (intent.product) return toolCall("search_products", { query: intent.product.alias });
    return text("Bonjour, que puis-je faire pour vous ?");
  }

  const last = called.at(-1);
  if (last === "send_product_photo") return text("Voici la photo du produit.");
  if (last === "handoff_to_owner") return text("Le propriétaire va vous répondre personnellement.");
  if (last === "search_products" && intent.order) {
    if (!intent.wilaya) return text("Dans quelle wilaya êtes-vous ?");
    return toolCall("quote_delivery", { wilaya: intent.wilaya, phone: intent.phone ?? "" });
  }
  if (last === "quote_delivery" && intent.order) {
    const searchMsg = inRun.find((m) => m.role === "tool" && names.get(m.tool_call_id) === "search_products");
    const found = searchMsg ? JSON.parse(searchMsg.content).results ?? [] : [];
    const product = found.find((p) => p.name === intent.product?.name) ?? found[0];
    const variant = product?.variants.find((v) => v.option.toLowerCase() === (intent.variantLabel ?? "").toLowerCase());
    if (!variant) return text("Quelle taille ou variante voulez-vous ?");
    // Like a model would: the details turn shows the summary (total = price + fee) and waits. The
    // create_order guard needs the total in an earlier assistant message, so only the confirmation
    // turn places the order.
    if (!intent.confirm) {
      const quoteMsg = inRun.find((m) => m.role === "tool" && names.get(m.tool_call_id) === "quote_delivery");
      const fee = moneyOf(JSON.parse(quoteMsg.content).delivery_fee);
      const price = moneyOf(variant.price ?? product.price);
      const total = price + fee;
      return text(
        `• ${product.name} ${variant.option} × 1: ${price} DZD\n• Livraison ${intent.wilaya}: ${fee} DZD\n• Total: ${total} DZD\n\nConfirmez-vous la commande ?`,
      );
    }
    return toolCall("create_order", {
      customer_name: intent.name,
      phone: intent.phone,
      wilaya: intent.wilaya,
      address: intent.address,
      items: [{ variant_id: variant.variant_id, quantity: 1 }],
    });
  }
  if (last === "create_order") {
    const orderMsg = inRun.find((m) => m.role === "tool" && names.get(m.tool_call_id) === "create_order");
    const placed = orderMsg && /order_placed/.test(orderMsg.content);
    return text(placed ? "Commande reçue. Le propriétaire vous contactera pour confirmer." : "Désolé, cette commande n'a pas pu être enregistrée.");
  }
  return text("Voici ce que j'ai trouvé.");
}
