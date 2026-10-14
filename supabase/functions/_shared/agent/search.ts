// Turns a customer's words into catalog search terms. Customers write plurals, filler, synonyms
// ("sneakers" for "basket"), Arabic article forms ("الحذاء") and typos ("basquete"). All of that
// normalisation lives here in JavaScript so the stress fake database runs the same code as production.

// Lowercase, strip accents and Arabic tashkeel/tatweel, and fold common Arabic letter variants.
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ص/g, "س");
}

// "hoooodie" -> "hoodie", "basketttt" -> "basket". Runs of two letters are kept (normal spelling).
export function collapse(word: string): string {
  return word.replace(/(\p{L})\1{2,}/gu, "$1");
}

// Customer tokens: the original spelling (lowercased, tashkeel removed) and its folded form.
interface Token {
  raw: string;
  folded: string;
}

function tokens(text: string): Token[] {
  const cleaned = text.normalize("NFC").replace(/[ً-ٰٟـ]/g, "");
  const out: Token[] = [];
  for (const raw of cleaned.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    out.push({ raw, folded: fold(raw) });
  }
  return out;
}

const STOPWORDS_RAW = [
  "the", "you", "your", "have", "has", "any", "and", "for", "with", "what", "are",
  "can", "does", "there", "got", "sell", "this", "that", "from", "please", "available",
  "stock", "price", "how", "much", "want", "need", "looking",
  // English filler a customer adds around the product word.
  "kind", "stuff", "some", "which", "item", "items", "show", "list", "more", "other",
  "thing", "things", "product", "products", "shop", "store", "hello", "hi", "hey", "anything",
  // Algerian Darija, Latin script (wach = is it, kayen = there is, bghit = I want, ...).
  "wach", "wash", "wesh", "ach", "kayen", "kayn", "kayna", "kaynin", "bghit", "bghina",
  "nheb", "nebghi", "nhab", "chhal", "ch7al", "chno", "chnou", "3andkom",
  "3andek", "3andi", "3andna", "3ndkom", "kifach", "kifash", "win", "fin", "bzaf",
  "mzyan", "dyal", "dial", "gadech", "bach", "3lach", "wakha", "bslama", "salam",
  "ya3tik", "sa7a",
  // French filler.
  "les", "des", "une", "pour", "avec", "est", "sur", "dans", "ces", "cette", "quel",
  "quelle", "quels", "quelles", "que", "vous", "nous", "ils", "elles", "combien", "svp", "stp",
  "bonjour", "bonsoir", "salut", "merci", "avez", "avoir", "dispo", "disponible", "prix",
  "sont", "votre", "vos", "aussi", "bien", "tres", "acheter", "commander",
  // Algerian Darija and MSA, Arabic script.
  "واش", "كاين", "كاينة", "كاينين", "بغيت", "بغا", "نحب", "نبغي", "شحال", "عندكم",
  "عندك", "عندي", "عندنا", "كيفاش", "فين", "وين", "بزاف", "مزيان", "سلام", "ديال",
  "ديالكم", "ديالك", "شنو", "علاش", "ولا", "بغينا", "واخا", "عليكم", "أريد", "أعرف",
  "سعر", "ثمن", "هل", "ممكن", "شكرا",
];
const STOPWORDS = new Set(STOPWORDS_RAW.map(fold));
// "السلام" is the stopword "سلام" with the article, so both forms are checked.
const isStopword = (folded: string, base: string) => STOPWORDS.has(folded) || STOPWORDS.has(base);

// Explicit synonym groups: a query word from any group matches every word of that group.
const SYNONYM_GROUPS_RAW: string[][] = [
  ["shoes", "shoe", "sneaker", "sneakers", "basket", "baskets", "chaussure", "chaussures",
    "sbadri", "sabat", "sbat", "صباط", "حذاء", "سبادري", "basquette", "basquete"],
  ["hoodie", "hoody", "sweat", "kapuchon", "capuche", "هودي", "كبوشون"],
  ["jean", "jeans", "pantalon", "sarwal", "سروال", "جينز"],
  ["cap", "casquette", "kaskita", "كاسكيطة", "قبعة", "chapeau"],
];
// Each group keeps the raw spelling (DB text may use ة or ص) and the folded one (for matching).
const SYNONYMS: string[][] = SYNONYM_GROUPS_RAW.map((g) =>
  [...new Set(g.flatMap((w) => [w.toLowerCase(), fold(w)]))]
);
const SYNONYM_OF = new Map<string, string[]>();
for (const group of SYNONYMS) for (const w of group) SYNONYM_OF.set(fold(w), group);

// Arabic glues the article to the word ("الكاسكيطة"), but aliases are usually written bare
// ("كاسكيطة"). Returns the word without its article, or null when there is none.
const ARABIC_ARTICLE = /^(وال|بال|لل|ال)/u;
function withoutArticle(w: string): string | null {
  const m = ARABIC_ARTICLE.exec(w);
  if (!m) return null;
  const rest = w.slice(m[0].length);
  return rest.length >= 3 ? rest : null;
}

// Spelling variants of one folded word: article-free, collapsed repeats, plurals.
function variantsOf(folded: string, raw: string): string[] {
  const out = new Set<string>([raw, folded]);
  for (const base of [raw, folded]) {
    const bare = withoutArticle(base);
    if (bare) out.add(bare);
  }
  for (const x of [...out]) out.add(collapse(x));
  for (const x of [...out]) {
    if (x.length > 3 && x.endsWith("s")) out.add(x.slice(0, -1)); // hoodies -> hoodie
    if (x.length > 4 && x.endsWith("es")) out.add(x.slice(0, -2)); // dresses -> dress
    if (x.length > 4 && x.endsWith("ies")) out.add(`${x.slice(0, -3)}y`); // hoodies -> hoody
  }
  return [...out].filter((v) => v.length >= 3);
}

// Editing distance with adjacent transpositions (optimal string alignment, a Damerau variant).
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

// Typo budget: one edit for short words, two for long ones. Words under 4 letters are never fuzzy.
export function maxEdits(word: string): number {
  return word.length >= 8 ? 2 : 1;
}
export const isFuzzyWord = (word: string) => word.length >= 4;

// The folded customer words that can take part in matching (no stopwords, no short tokens).
export function queryWords(query: string): string[] {
  const out: string[] = [];
  for (const t of tokens(query)) {
    const base = withoutArticle(t.folded) ?? t.folded;
    if (base.length < 3 || isStopword(t.folded, base)) continue;
    out.push(base);
  }
  return [...new Set(out)];
}

// Each word becomes a group of spelling variants; a product matches the word if it contains any
// variant. Words with a synonym group get the whole group. Pure numbers go last.
// Over-matching is fine: results are ranked afterwards.
export function searchGroups(query: string): string[][] {
  const synonymHits: string[][] = [];
  const plain: string[][] = [];
  const numeric: string[][] = [];
  const seen = new Set<string>();
  for (const t of tokens(query)) {
    const base = withoutArticle(t.folded) ?? t.folded;
    if (base.length < 3 || isStopword(t.folded, base) || seen.has(base)) continue;
    seen.add(base);
    const variants = variantsOf(t.folded, t.raw);
    if (/^\p{N}+$/u.test(t.folded)) {
      numeric.push(variants);
      continue;
    }
    // Any spelling variant (plural stripped, article stripped, collapsed) may be the synonym.
    const syn = variants.map((v) => SYNONYM_OF.get(fold(v))).find((g) => g !== undefined);
    if (syn) {
      const group = [...variants];
      for (const w of syn) if (!group.includes(w)) group.push(w);
      synonymHits.push(group);
    } else {
      plain.push(variants);
    }
  }
  const groups: string[][] = [];
  const keys = new Set<string>();
  for (const g of [...synonymHits, ...plain, ...numeric]) {
    const key = [...g].sort().join("|");
    if (keys.has(key)) continue;
    keys.add(key);
    groups.push(g);
    if (groups.length === 5) break;
  }
  return groups;
}

// Typo fallback, used only when the exact search found nothing: a customer word within the typo
// budget of a synonym word adds that synonym group ("basquete" -> shoes, "kapucho" -> hoodie).
export function fuzzySynonymGroups(words: string[]): string[][] {
  const out: string[][] = [];
  const keys = new Set<string>();
  for (const w of words) {
    if (!isFuzzyWord(w) || SYNONYM_OF.has(w)) continue;
    const hit = [...SYNONYM_OF.keys()]
      .filter((s) => editDistance(w, s) <= maxEdits(w))
      .sort((a, b) => editDistance(w, a) - editDistance(w, b) || (a < b ? -1 : 1))[0];
    if (!hit) continue;
    const group = SYNONYM_OF.get(hit) ?? [hit];
    const key = [...group].sort().join("|");
    if (!keys.has(key)) {
      keys.add(key);
      out.push([...group]);
    }
  }
  return out;
}

// Fuzzy score of a product: query words within the typo budget of one of its name/alias words.
export function fuzzyScore(words: string[], name: string, aliases?: string | null): number {
  const productWords = new Set(fold(`${name} ${aliases ?? ""}`).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  let score = 0;
  for (const w of words) {
    if (!isFuzzyWord(w)) continue;
    if ([...productWords].some((p) => p.length >= 3 && editDistance(w, p) <= maxEdits(w))) score++;
  }
  return score;
}

export function scoreProduct(
  name: string,
  description: string | null,
  groups: string[][],
  aliases?: string | null,
): number {
  // Aliases are other names for the product, so they count like the name. Both sides are folded
  // so that the spelling variants in the groups match Arabic written with other letters.
  const n = fold(`${name} ${aliases ?? ""}`);
  const d = fold(description ?? "");
  return groups.reduce(
    (score, g) =>
      score + (g.some((v) => n.includes(fold(v))) ? 2 : 0) +
      (g.some((v) => d.includes(fold(v))) ? 1 : 0),
    0,
  );
}
