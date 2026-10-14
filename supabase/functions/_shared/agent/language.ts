// Which language to use for the replies the server writes itself (fast-path greetings and thanks,
// holding replies when the model can't answer) and for the per-turn language hint in the prompt.
//
// "dz" is Algerian Darija written in Latin letters (arabizi: "salam", "wach", "bghit", "b9addeh").
// It must never fall back to French: customers who write that way expect Darija back.
//
// Fallback order: the language of this message, then the language of the conversation (earlier
// customer turns). Only the server's fixed replies fall back to English. The model's hint never names
// English without a signal: it says "same language and script as the customer's last message".

import { wilayaLatinNames } from "./wilaya.ts";

export type Lang = "ar" | "fr" | "en" | "dz";

// Arabic letters only. Digits (Arabic-Indic U+0660-0669 and U+06F0-06F9) and punctuation such as "؟"
// are not letters, so "٣٥٠٠" or "؟" inside a Latin-letter Darija message is not Arabic script.
const ARABIC_LETTER = /(?![٠-٩۰-۹])(?=\p{Script=Arabic})\p{L}/u;
export const hasArabicScript = (text: string) => ARABIC_LETTER.test(text);
const CYRILLIC = /\p{Script=Cyrillic}/u;
const FRENCH_ACCENT = /[éèêëàâçùûîïôœ]/iu;

// Latin spellings of the 58 wilayas ("Béjaïa", "El Oued"), longest first. They are removed before the
// accent and word checks, so a place name does not make an English or Darija message French or Darija.
const WILAYA_PATTERN = new RegExp(
  wilayaLatinNames()
    .sort((a, b) => b.length - a.length)
    .map((n) => `(?<!\\p{L})${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\p{L})`)
    .join("|"),
  "giu",
);
const stripWilayas = (text: string) => text.replace(WILAYA_PATTERN, " ");

// Words that only appear in French (not in Darija or English).
const FRENCH_WORDS = new Set([
  // Shop words (taille, prix, livraison, commande, disponible) are left out: Darija uses them too.
  "bonjour", "bonsoir", "salut", "merci", "vous", "avez", "avoir", "est", "combien",
  "voudrais", "veux", "svp", "je",
  "il", "elle", "le", "la", "les", "des", "du", "pour", "avec", "coûte", "coute", "quel", "quelle",
  "nous", "oui", "non", "j'ai", "s'il", "bien", "pas", "bonne", "jour",
  // Grown from the stress-test cases (AD-003, AD-033, AD-051, AD-018, AD-012, PS-072 is left neutral).
  "affiche", "developpeur", "systeme", "regles", "sans", "tu", "et", "ce", "dit", "fais",
  "texte", "qu'il", "que", "es", "un", "vendeur", "qui", "peut", "tout", "joue", "offre", "moi",
  "gratuit",
]);

// Confirmation words. "oui je confirme" in a Darija chat does not switch the chat to French.
const CONFIRM_WORDS = new Set(["oui", "je", "confirme", "confirmé", "confirmi"]);

// Words and spellings typical of Algerian Darija in Latin letters. Each one is strong evidence.
const DARIJA_WORDS = new Set([
  "wach", "wesh", "kayen", "kayn", "kayna", "kaynin", "bghit", "bghiti",
  "bghina", "bghitch", "mabghitch", "chhal", "ch7al", "chnou", "chno", "kifach", "kifech", "kifesh",
  "smiti", "smitek", "smitha", "nchri", "nkhalas", "ntcommandi", "tcommandi", "tqdar", "ydir",
  "ydirou", "dyal", "daba", "rani", "rak", "nta", "nti", "howa", "hia", "ana", "hna", "bzaf",
  "bzzaf", "mzyan", "mezyan", "zwin", "ih", "wakha", "makaynch", "makayench", "khoya", "sahbi",
  "sbah", "msa", "mar7ba", "mrhba", "marhba", "marhaba", "ahlan", "ahla", "chouf", "shuf",
  "saha", "sahit", "choukran", "chokran", "shukran", "lbas", "ndir", "ghadi", "ghaydir", "wla",
  "walakin", "dork", "tawa", "yak", "khdemt", "tani", "nkhdem", "bslama", "ndirlek", "rahi",
  "rahom", "ya3tik", "yaatik", "barak", "allah", "allahou", "fik", "hadi", "hadak",
  // Grown from the stress-test cases (AD-015, AD-018, AD-051, LG-062, NZ-063, OR-003, PO-005, PS-008, PS-029, PS-078).
  "wrini", "warini", "nchouf", "tswira", "ouvrin", "lfajr", "kaskita", "kapuchon", "sbadri",
  "tarjem", "nfadh", "li", "3tak", "kteb", "hom", "lia", "kamlin", "tn9ssch",
  "chi", "lclient", "kolo", "dir", "tlefon", "iyeh", "bt", "f", "nheb", "ytsalmo", "ghedwa", "3la",
]);

// Greetings that carry no language on their own: "salam, do you have..." is English, while a
// message that is only "salam" still reads as Darija.
const WEAK_DARIJA_WORDS = new Set(["salam", "slm", "salem"]);

// Latin-letter word with an Arabic-derived digit: 3 for ع, 7 for ح, 9 for ق (b9addeh, n3awnek).
const DARIJA_DIGIT_WORD = /^(?=.*[a-z])[a-z]*[379][a-z]*$/u;

// Words that only appear in English here.
const ENGLISH_WORDS = new Set([
  "the", "you", "do", "have", "is", "are", "what", "how", "much", "hello", "hi", "thanks", "thank",
  "please", "i", "want", "black", "white", "size", "order", "price", "and", "with", "can",
  "to", "shipping", "cost", "fee", "deliver", "your", "my", "for", "where", "when", "u", "any",
  // Grown from the stress-test case PS-036 ("jean slim 42 in stock?").
  "in", "stock", "available",
]);

// French words that show up in a French reply but are not in FRENCH_WORDS (shop words are left out).
// Used only to judge a model reply (languageMismatch), never to detect the customer's language.
const FRENCH_REPLY_EXTRA = new Set([
  "voulez", "autre", "actuellement", "vérifier", "verifier", "pouvez", "souhaitez", "désolé", "désolée",
  "moment", "aussi", "très", "votre", "vos", "notre", "nos",
]);

const isStrongDarija = (w: string) => DARIJA_WORDS.has(w) || DARIJA_DIGIT_WORD.test(w);
const isDarijaWord = (w: string) => isStrongDarija(w) || WEAK_DARIJA_WORDS.has(w);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/’/g, "'")
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => /\p{L}/u.test(w));
}

// The language of one message, or null when it gives no clear signal ("ok", "11", a name).
export function detectLangStrict(text: string): Lang | null {
  if (hasArabicScript(text)) return "ar";
  const plain = stripWilayas(text);
  let strong = 0;
  let weak = 0;
  let french = 0;
  let english = 0;
  for (const w of words(plain)) {
    if (isStrongDarija(w)) strong++;
    else if (WEAK_DARIJA_WORDS.has(w)) weak++;
    else if (FRENCH_WORDS.has(w)) french++;
    else if (ENGLISH_WORDS.has(w)) english++;
  }
  // Darija wins unless the message is clearly French ("salam, le jean il coûte combien ?" is French).
  if (strong > 0) return french > strong ? "fr" : "dz";
  if (french > 0 || FRENCH_ACCENT.test(plain)) return "fr";
  if (english > 0) return "en";
  if (weak > 0) return "dz";
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

// Marks a user turn that the server adds for a retry (see scriptCorrection). It is not the customer's
// text, so it never changes the language.
export const CORRECTION_MARK = "[Wakil correction]";

// The language of the conversation, read oldest first, or null when no customer message gave a
// signal. Neutral messages ("ok", a name, an address, "iyeh confirmi") keep the current language. A
// Darija conversation turns French only on strong evidence: 2+ French words (confirmation words
// excluded) and no Darija word, so an accent such as "cité" alone doesn't switch it.
export function conversationSignal(history: { role: string; text: string }[]): Lang | null {
  let lang: Lang | null = null;
  for (const m of history) {
    if (m.role !== "user" || m.text.startsWith(CORRECTION_MARK)) continue;
    const signal = detectLangStrict(m.text);
    if (!signal) continue;
    if (lang === "dz" && signal !== "ar") {
      const ws = words(stripWilayas(m.text));
      const darija = ws.some(isDarijaWord);
      const french = ws.filter((w) => FRENCH_WORDS.has(w) && !CONFIRM_WORDS.has(w)).length;
      if (darija || french < 2) continue;
    }
    lang = signal;
  }
  return lang;
}

// For the server's own fixed replies, which must be in some language: English when there is no signal.
export function conversationLang(history: { role: string; text: string }[]): Lang {
  return conversationSignal(history) ?? "en";
}

// Script check of a model reply: what is wrong with it, or null. Latin-letter Darija replies have no
// Arabic letters; Cyrillic letters are never right.
// Any other letter that is neither Latin nor Arabic script (CJK, Thai, Devanagari, Hangul, ...). Common and
// Inherited characters are not letters of a script, so Latin-letter marks such as ʿ or ʼ pass.
const FOREIGN_SCRIPT = /(?![\p{Script=Latin}\p{Script=Arabic}\p{Script=Common}\p{Script=Inherited}])\p{L}/u;

export type ScriptProblem = "arabic_letters" | "cyrillic_letters" | "foreign_script";

export function scriptProblem(reply: string, lang: Lang | null): ScriptProblem | null {
  if (lang === "dz" && hasArabicScript(reply)) return "arabic_letters";
  if (CYRILLIC.test(reply)) return "cyrillic_letters";
  if (FOREIGN_SCRIPT.test(reply)) return "foreign_script";
  return null;
}

// The user-side note that asks the model for one corrected reply.
export function scriptCorrection(problem: ScriptProblem): string {
  const what = problem === "arabic_letters"
    ? "Your last reply used Arabic-script letters, but the customer writes Latin-letter Algerian Darija. Rewrite the reply using only Latin letters, with no Arabic script at all."
    : problem === "cyrillic_letters"
    ? "Your last reply contained Cyrillic letters, which are never allowed. Rewrite the reply in the customer's language and script, using no Cyrillic letters."
    : "Your last reply contained letters from a script the conversation does not use (for example Chinese, Thai or Devanagari characters). Rewrite the reply using only Latin letters, or Arabic script when the customer writes in Arabic script, and no other script.";
  return `${CORRECTION_MARK} ${what} Keep the same facts and the same tool results, and change nothing else.`;
}

// A reply that is confidently in another language than the conversation: at least 3 words from the
// other language's list and none from the conversation's own list. Darija replies that mix French
// product words ("Basket blanche taille 41", "commune, rue") have Darija words, so they never count.
// Returns the language the reply is actually in, or null.
export function languageMismatch(reply: string, expected: Lang | null): Lang | null {
  if (!expected || !reply.trim()) return null;
  const counts: Record<Lang, number> = { ar: 0, fr: 0, en: 0, dz: 0 };
  const ws = words(stripWilayas(reply));
  for (const w of ws) {
    if (isDarijaWord(w)) counts.dz++;
    if (FRENCH_WORDS.has(w) || FRENCH_REPLY_EXTRA.has(w)) counts.fr++;
    if (ENGLISH_WORDS.has(w)) counts.en++;
  }
  const own: Record<Lang, number> = {
    ar: hasArabicScript(reply) ? 1 : 0,
    fr: counts.fr,
    en: counts.en,
    dz: counts.dz,
  };
  if (own[expected] > 0) return null;
  // An Arabic-script conversation: any Latin-letter reply with 3 or more words of another language.
  if (expected === "ar") {
    if (hasArabicScript(reply)) return null;
    const best = (["fr", "en", "dz"] as const).find((l) => counts[l] >= 3);
    return best ?? null;
  }
  const other = (["fr", "en", "dz"] as const).find((l) => l !== expected && counts[l] >= 3 && !(expected === "dz" && hasArabicScript(reply)));
  return other ?? null;
}

// The user-side note that asks for one reply in the expected language.
export function languageCorrection(expected: Lang): string {
  return `${CORRECTION_MARK} Your last reply was not in the customer's language. Rewrite the reply in ${LANG_NAME[expected]}, as the customer wrote it. Keep the same facts and the same tool results, and change nothing else.`;
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
