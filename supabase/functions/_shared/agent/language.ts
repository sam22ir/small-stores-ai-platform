// Which language to use for the few fixed messages the server writes itself (holding replies
// when the model can't answer). The model's own replies already follow the customer's language.

export type Lang = "ar" | "fr" | "en";

const FRENCH_CUES =
  /[éèêàçùâîôû]|\b(bonjour|bonsoir|salut|merci|vous|avez|avoir|est-ce|combien|prix|livraison|livrer|commande|voudrais|veux|taille|svp|s'il|disponible|je|j'ai|wach|wesh|kayen|kayn|bghit|chhal|ch7al|9ima|b9ima|slm|salam|choukran)\b/iu;

export function detectLang(text: string): Lang {
  if (/[؀-ۿ]/.test(text)) return "ar";
  return FRENCH_CUES.test(text) ? "fr" : "en";
}

export function lastCustomerText(history: { role: string; text: string }[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].text;
  }
  return "";
}

const HOLDING: Record<Lang, string> = {
  en: "Thanks for your message! I've passed this to the owner, who will reply to you personally.",
  fr: "Merci pour votre message ! Je l'ai transmis au propriétaire, qui vous répondra personnellement.",
  ar: "شكرا على رسالتك! حوّلتها إلى صاحب المتجر وسيرد عليك شخصيا.",
};

const LIMIT: Record<Lang, string> = {
  en: "Thanks for your message! The owner will reply to you personally as soon as possible.",
  fr: "Merci pour votre message ! Le propriétaire vous répondra personnellement dès que possible.",
  ar: "شكرا على رسالتك! سيرد عليك صاحب المتجر شخصيا في أقرب وقت.",
};

export const holdingReply = (lang: Lang) => HOLDING[lang];
export const limitReply = (lang: Lang) => LIMIT[lang];
