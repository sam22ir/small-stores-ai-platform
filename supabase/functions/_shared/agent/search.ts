// Turns a customer's words into catalog search terms. Customers write plurals and filler
// ("do you have hoodies?"); a plain substring match on "hoodies" misses "Black Hoodie".

const STOPWORDS = new Set([
  "the", "you", "your", "have", "has", "any", "and", "for", "with", "what", "are",
  "can", "does", "there", "got", "sell", "this", "that", "from", "please", "available",
  "stock", "price", "how", "much", "want", "need", "looking",
  // Algerian Darija, Latin script (wach = is it, kayen = there is, bghit = I want, ...).
  "wach", "wash", "wesh", "ach", "kayen", "kayn", "kayna", "kaynin", "bghit", "bghina",
  "nheb", "nebghi", "nhab", "chhal", "ch7al", "chno", "chnou", "3andkom",
  "3andek", "3andi", "3andna", "3ndkom", "kifach", "kifash", "win", "fin", "bzaf",
  "mzyan", "dyal", "dial", "gadech", "bach", "3lach", "wakha", "bslama", "salam",
  // French filler.
  "les", "des", "une", "pour", "avec", "est", "sur", "dans", "ces", "cette", "quel",
  "quelle", "quels", "quelles", "que", "vous", "nous", "ils", "elles", "combien", "svp", "stp",
  "bonjour", "bonsoir", "salut", "merci", "avez", "avoir", "dispo", "disponible", "prix",
  "sont", "votre", "vos", "aussi", "bien", "tres", "acheter", "commander",
  // Algerian Darija, Arabic script.
  "واش", "كاين", "كاينة", "كاينين", "بغيت", "بغا", "نحب", "نبغي", "شحال", "عندكم",
  "عندك", "عندي", "عندنا", "كيفاش", "فين", "وين", "بزاف", "مزيان", "سلام", "ديال",
  "ديالكم", "ديالك", "شنو", "علاش", "ولا", "بغيت", "بغينا", "واخا",
]);

// Each word becomes a group of spelling variants; a product matches the word if it
// contains any variant. Over-matching is fine: results are ranked afterwards.
export function searchGroups(query: string): string[][] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const groups: string[][] = [];
  for (const w of new Set(words)) {
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    const variants = new Set([w]);
    if (w.length > 3 && w.endsWith("s")) variants.add(w.slice(0, -1)); // hoodies -> hoodie
    if (w.length > 4 && w.endsWith("es")) variants.add(w.slice(0, -2)); // dresses -> dress
    if (w.length > 4 && w.endsWith("ies")) variants.add(`${w.slice(0, -3)}y`); // hoodies -> hoody
    groups.push([...variants].filter((v) => v.length >= 3));
    if (groups.length === 5) break;
  }
  return groups;
}

export function scoreProduct(
  name: string,
  description: string | null,
  groups: string[][],
  aliases?: string | null,
): number {
  // Aliases are other names for the product, so they count like the name.
  const n = `${name} ${aliases ?? ""}`.toLowerCase();
  const d = (description ?? "").toLowerCase();
  return groups.reduce(
    (score, g) =>
      score + (g.some((v) => n.includes(v)) ? 2 : 0) +
      (g.some((v) => d.includes(v)) ? 1 : 0),
    0,
  );
}
