// Zero-cost replies for messages that are only a greeting or a thank-you.
// No model call, no tokens, not counted towards the store's monthly limit.
//
// Deliberately NOT handled: "ok", "yes", "d'accord", "ماشي"... After an order summary those
// mean "I confirm", and only the agent (with the conversation) can tell.

import { hasArabicScript } from "./language.ts";

type Kind = "greeting" | "thanks";
type Lang = "ar" | "fr" | "en" | "dz";

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
    "هلا والله",
    "اهلين",
    "أهلين",
    "مرحبا بك",
    "السلام",
    "صباح الخير",
    "مساء الخير",
  ]],
  ["fr", [
    "bonjour",
    "bonsoir",
    "salut",
    "coucou",
    "cc",
    "slt",
    "bjr",
    "bsr",
  ]],
  // Latin-script Darija: answered in Latin-script Darija, never French.
  ["dz", [
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
    "salam 3alaykom",
    "salam 3alaykoum",
    "salam 3alaykum",
    "salam 3alikom",
    "salam 3alikoum",
    "salam 3likom",
    "salam 3likoum",
    "salam alikoum",
    "assalam alikom",
    "assalam alikoum",
    "assalamu alaykoum",
    "salam aleikom",
    "salam aleikum",
    "salam wa rahmatu allah",
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
    "يعطيك الصحة",
    "الله يعطيك الصحة",
    "تسلم",
    "يسلمو",
    "جزاك الله",
  ]],
  ["fr", [
    "merci beaucoup",
    "merci bcp",
    "merci",
    "mrc",
  ]],
  ["dz", [
    "merci bzaf",
    "merci bzzaf",
    "jazak allah khair",
    "jazakallah khair",
    "jazak allahu khayran",
    "choukran",
    "chokran",
    "shukran",
    "saha",
    "sahit",
    "ya3tik saha",
    "yaatik essaha",
    "yaatik saha",
    "barak allah fik",
    "barakallahou fik",
    "baraka allahou fik",
  ]],
  ["en", ["thank you very much", "thank you", "thanks a lot", "thanks", "thank u", "thx"]],
];

const REPLIES: Record<Kind, Record<Lang, (store: string) => string>> = {
  greeting: {
    ar: (s) => `أهلاً وسهلاً بك في ${s}! كيف يمكنني مساعدتك؟`,
    fr: (s) => `Bonjour et bienvenue chez ${s} ! Comment puis-je vous aider ?`,
    en: (s) => `Hi, welcome to ${s}! How can I help you?`,
    dz: (s) => `Salam, mar7ba bik f ${s}! Kifach n9der n3awnek?`,
  },
  thanks: {
    ar: () => "العفو! إذا احتجت أي شيء آخر أنا هنا.",
    fr: () => "Avec plaisir ! Si vous avez besoin d'autre chose, je suis là.",
    en: () => "You're welcome! Let me know if you need anything else.",
    dz: () => "Bla mochkil! Ila bghiti chi 7aja okhra, ana hna.",
  },
};

// Lowercase, drop Arabic diacritics, tatweel, punctuation and emoji; collapse stretched
// letters ("salaaaam", "heyyy") so they compare equal to the plain spelling.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(.)\1+/gu, "$1")
    .replace(/\s+/g, " ")
    .trim()
    // "peace be upon you": عليكم / عليكن / عليك / عليكي / عليكما all count as the same greeting.
    .replace(/عليك(?:ن|ي|ما|م)?(?=\s|$)/gu, "عليكم");
}

const phrases: Phrase[] = [
  ...GREETINGS.flatMap(([lang, list]) =>
    list.map((text) => ({ text: normalize(text), kind: "greeting" as const, lang }))
  ),
  ...THANKS.flatMap(([lang, list]) =>
    list.map((text) => ({ text: normalize(text), kind: "thanks" as const, lang }))
  ),
].sort((a, b) => b.text.length - a.text.length);

// Arabic letters only: Arabic-Indic digits in a Latin-letter message do not make it Arabic.
const hasArabic = hasArabicScript;

// Returns the reply, or null when the message needs the agent.
// signal: the language of the conversation (see conversationSignal), or null when there is none. When it
// is known it wins over the phrase's own language: "merci" in a Darija chat gets the Darija thanks. Arabic
// script in the message itself still gives Arabic. Without a signal the phrase's language is used.
export function fastPathReply(text: string, storeName: string, signal: Lang | null = null): string | null {
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
  const lang: Lang = hasArabic(text) ? "ar" : (signal ?? first.lang);
  return REPLIES[first.kind][lang](storeName);
}
