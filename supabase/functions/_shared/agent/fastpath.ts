// Zero-cost replies for messages that are only a greeting or a thank-you.
// No model call, no tokens, not counted towards the store's monthly limit.
//
// Deliberately NOT handled: "ok", "yes", "d'accord", "ماشي"... After an order summary those
// mean "I confirm", and only the agent (with the conversation) can tell.

type Kind = "greeting" | "thanks";
type Lang = "ar" | "fr" | "en";

interface Phrase {
  text: string;
  kind: Kind;
  lang: Lang;
}

const GREETINGS: [Lang, string[]][] = [
  ["ar", [
    "السلام عليكم ورحمة الله وبركاته",
    "السلام عليكم ورحمة الله",
    "السلام عليكم",
    "سلام عليكم",
    "سلام",
    "مرحبا",
    "مرحباً",
    "اهلا",
    "أهلا",
    "اهلا وسهلا",
    "أهلا وسهلا",
    "هلا",
    "صباح الخير",
    "مساء الخير",
  ]],
  ["fr", [
    "bonjour",
    "bonsoir",
    "salut",
    "coucou",
    "cc",
    // Latin-script Darija: answered in French, the usual written register.
    "salam alaykum",
    "salam aleykoum",
    "salam alikom",
    "salam alaykoum",
    "assalamu alaykum",
    "assalam alaykum",
    "assalam aleykoum",
    "salam",
    "slm",
    "salem",
    "ahlan",
    "ahla",
    "marhba",
    "marhaba",
    "sbah el khir",
    "sba7 lkhir",
    "msa el khir",
  ]],
  ["en", ["hello", "hi", "hey", "good morning", "good evening", "good afternoon"]],
];

const THANKS: [Lang, string[]][] = [
  ["ar", [
    "شكرا جزيلا",
    "شكرا",
    "شكراً",
    "جزاك الله خيرا",
    "جزاك الله خير",
    "بارك الله فيك",
    "الله يبارك فيك",
    "بصحتك",
  ]],
  ["fr", [
    "merci beaucoup",
    "merci",
    "choukran",
    "chokran",
    "shukran",
    "saha",
    "sahit",
    "barak allah fik",
    "barakallahou fik",
    "baraka allahou fik",
    "yaatik essaha",
  ]],
  ["en", ["thank you very much", "thank you", "thanks a lot", "thanks", "thx"]],
];

const REPLIES: Record<Kind, Record<Lang, (store: string) => string>> = {
  greeting: {
    ar: (s) => `أهلاً وسهلاً بك في ${s}! كيف يمكنني مساعدتك؟`,
    fr: (s) => `Bonjour et bienvenue chez ${s} ! Comment puis-je vous aider ?`,
    en: (s) => `Hi, welcome to ${s}! How can I help you?`,
  },
  thanks: {
    ar: () => "العفو! إذا احتجت أي شيء آخر أنا هنا.",
    fr: () => "Avec plaisir ! Si vous avez besoin d'autre chose, je suis là.",
    en: () => "You're welcome! Let me know if you need anything else.",
  },
};

// Lowercase, drop Arabic diacritics, tatweel, punctuation and emoji; collapse stretched
// letters ("salaaaam", "heyyy") so they compare equal to the plain spelling.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(.)\1+/gu, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const phrases: Phrase[] = [
  ...GREETINGS.flatMap(([lang, list]) =>
    list.map((text) => ({ text: normalize(text), kind: "greeting" as const, lang }))
  ),
  ...THANKS.flatMap(([lang, list]) =>
    list.map((text) => ({ text: normalize(text), kind: "thanks" as const, lang }))
  ),
].sort((a, b) => b.text.length - a.text.length);

const hasArabic = (t: string) => /[؀-ۿ]/.test(t);

// Returns the reply, or null when the message needs the agent.
export function fastPathReply(text: string, storeName: string): string | null {
  if (text.length > 60) return null;
  let rest = ` ${normalize(text)} `;
  if (rest.trim() === "") return null;

  const matched: Phrase[] = [];
  for (const p of phrases) {
    const needle = ` ${p.text} `;
    while (rest.includes(needle)) {
      rest = rest.replace(needle, " ");
      matched.push(p);
    }
  }
  if (matched.length === 0 || rest.trim() !== "") return null;

  // Thanks wins over a greeting: "salam merci" is closing the chat, not opening it.
  const first = matched.find((p) => p.kind === "thanks") ?? matched[0];
  const lang: Lang = hasArabic(text) ? "ar" : first.lang;
  return REPLIES[first.kind][lang](storeName);
}
