// Which language to use for the replies the server writes itself (fast-path greetings and thanks,
// holding replies when the model can't answer) and for the per-turn language hint in the prompt.
//
// "dz" is Algerian Darija written in Latin letters (arabizi: "salam", "wach", "bghit", "b9addeh").
// It must never fall back to French: customers who write that way expect Darija back.

export type Lang = "ar" | "fr" | "en" | "dz";

const ARABIC_SCRIPT = /[؀-ۿ]/;
const FRENCH_ACCENT = /[éèêëàâçùûîïôœ]/iu;

// Words that only appear in French (not in Darija or English).
const FRENCH_WORDS = new Set([
  // Shop words (taille, prix, livraison, commande, disponible) are left out: Darija uses them too.
  "bonjour", "bonsoir", "salut", "merci", "vous", "avez", "avoir", "est", "combien",
  "voudrais", "veux", "svp", "je",
  "il", "elle", "le", "la", "les", "des", "du", "pour", "avec", "coûte", "coute", "quel", "quelle",
  "nous", "oui", "non", "j'ai", "s'il", "bien", "pas", "bonne", "jour",
]);

// Words and spellings typical of Algerian Darija in Latin letters.
const DARIJA_WORDS = new Set([
  "salam", "slm", "salem", "wach", "wesh", "kayen", "kayn", "kayna", "kaynin", "bghit", "bghiti",
  "bghina", "bghitch", "mabghitch", "chhal", "ch7al", "chnou", "chno", "kifach", "kifech", "kifesh",
  "smiti", "smitek", "smitha", "nchri", "nkhalas", "ntcommandi", "tcommandi", "tqdar", "ydir",
  "ydirou", "dyal", "daba", "rani", "rak", "nta", "nti", "howa", "hia", "ana", "hna", "bzaf",
  "bzzaf", "mzyan", "mezyan", "zwin", "ih", "wakha", "makaynch", "makayench", "khoya", "sahbi",
  "sbah", "msa", "mar7ba", "mrhba", "marhba", "marhaba", "ahlan", "ahla", "chouf", "shuf",
  "saha", "sahit", "choukran", "chokran", "shukran", "lbas", "ndir", "ghadi", "ghaydir", "wla",
  "walakin", "dork", "tawa", "yak", "khdemt", "tani", "nkhdem", "bslama", "ndirlek", "rahi",
  "rahom", "ya3tik", "yaatik", "barak", "allah", "allahou", "fik", "hadi", "hadak",
]);

// Latin-letter words with an Arabic-derived digit: 3 for ع, 7 for ح, 9 for ق (b9addeh, n3awnek).
const DARIJA_DIGIT_WORD = /^(?=.*[a-z])[a-z]*[379][a-z]*$/u;

// Words that only appear in English here.
const ENGLISH_WORDS = new Set([
  "the", "you", "do", "have", "is", "are", "what", "how", "much", "hello", "hi", "thanks", "thank",
  "please", "i", "want", "black", "white", "size", "order", "price", "and", "with", "can",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/’/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => /\p{L}/u.test(w));
}

// The language of one message, or null when it gives no clear signal ("ok", "11", a name).
export function detectLangStrict(text: string): Lang | null {
  if (ARABIC_SCRIPT.test(text)) return "ar";
  let darija = 0;
  let french = 0;
  let english = 0;
  for (const w of words(text)) {
    if (DARIJA_WORDS.has(w) || DARIJA_DIGIT_WORD.test(w)) darija++;
    else if (FRENCH_WORDS.has(w)) french++;
    else if (ENGLISH_WORDS.has(w)) english++;
  }
  // Darija wins unless the message is clearly French ("salam, le jean il coûte combien ?" is French).
  if (darija > 0) return french > darija ? "fr" : "dz";
  if (french > 0 || FRENCH_ACCENT.test(text)) return "fr";
  if (english > 0) return "en";
  return null;
}

export function detectLang(text: string): Lang {
  return detectLangStrict(text) ?? "en";
}

export function lastCustomerText(history: { role: string; text: string }[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "user") return history[i].text;
  }
  return "";
}

// The language to reply in for this turn, read oldest first. Neutral messages ("ok", a name, an
// address) keep the current language. A Darija conversation turns French only on strong evidence:
// 2+ French words and no Darija word, so an accent such as "cité" alone doesn't switch it.
// Falls back to English.
export function conversationLang(history: { role: string; text: string }[]): Lang {
  let lang: Lang | null = null;
  for (const m of history) {
    if (m.role !== "user") continue;
    const signal = detectLangStrict(m.text);
    if (!signal) continue;
    if (lang === "dz" && signal !== "ar") {
      const ws = words(m.text);
      const darija = ws.some((w) => DARIJA_WORDS.has(w) || DARIJA_DIGIT_WORD.test(w));
      const french = ws.filter((w) => FRENCH_WORDS.has(w)).length;
      if (darija || french < 2) continue;
    }
    lang = signal;
  }
  return lang ?? "en";
}

const HOLDING: Record<Lang, string> = {
  en: "Thanks for your message! I've passed this to the owner, who will reply to you personally.",
  fr: "Merci pour votre message ! Je l'ai transmis au propriétaire, qui vous répondra personnellement.",
  ar: "شكرا على رسالتك! حوّلتها إلى صاحب المتجر وسيرد عليك شخصيا.",
  dz: "Choukran 3la message! Wselt had l'message l'propriétaire, ghadi yjawbek b nafsou.",
};

const LIMIT: Record<Lang, string> = {
  en: "Thanks for your message! The owner will reply to you personally as soon as possible.",
  fr: "Merci pour votre message ! Le propriétaire vous répondra personnellement dès que possible.",
  ar: "شكرا على رسالتك! سيرد عليك صاحب المتجر شخصيا في أقرب وقت.",
  dz: "Choukran 3la message! L'propriétaire ghadi yjawbek b nafsou f asra3 waqt.",
};

export const holdingReply = (lang: Lang) => HOLDING[lang];
export const limitReply = (lang: Lang) => LIMIT[lang];

// Names used in the prompt's per-turn language hint.
export const LANG_NAME: Record<Lang, string> = {
  en: "English",
  fr: "French",
  ar: "Arabic script",
  dz: "Algerian Darija in Latin letters (arabizi), not French and not Arabic script",
};
