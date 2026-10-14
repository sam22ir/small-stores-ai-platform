// Maps how a customer spells one of Algeria's 58 wilayas (Arabic, French, Latin
// transliterations, common variants, accents, or the code number) to a canonical key:
// the two-digit wilaya code, "01".."58".

const WILAYAS: { code: string; names: string[] }[] = [
  { code: "01", names: ["Adrar", "أدرار"] },
  { code: "02", names: ["Chlef", "Chleff", "Chelif", "الشلف"] },
  { code: "03", names: ["Laghouat", "Laghwat", "الأغواط"] },
  { code: "04", names: ["Oum El Bouaghi", "Oum Bouaghi", "أم البواقي"] },
  { code: "05", names: ["Batna", "باتنة"] },
  { code: "06", names: ["Béjaïa", "Bejaia", "Bgayet", "Bougie", "بجاية"] },
  { code: "07", names: ["Biskra", "بسكرة"] },
  { code: "08", names: ["Béchar", "Bechar", "Bechir", "بشار"] },
  { code: "09", names: ["Blida", "El Blida", "البليدة"] },
  { code: "10", names: ["Bouira", "البويرة"] },
  { code: "11", names: ["Tamanrasset", "Tamanghasset", "تامنغست"] },
  { code: "12", names: ["Tébessa", "Tebessa", "تبسة"] },
  { code: "13", names: ["Tlemcen", "Tilimsen", "تلمسان"] },
  { code: "14", names: ["Tiaret", "تيارت"] },
  { code: "15", names: ["Tizi Ouzou", "Tizi", "Tizi-Ouzou", "تيزي وزو"] },
  {
    code: "16",
    names: ["Alger", "Algiers", "Alger Centre", "Dzayer", "Dzair", "El Djazair", "Djazair", "الجزائر", "الجزائر العاصمة"],
  },
  { code: "17", names: ["Djelfa", "Jelfa", "الجلفة"] },
  { code: "18", names: ["Jijel", "جيجل"] },
  { code: "19", names: ["Sétif", "Setif", "سطيف"] },
  { code: "20", names: ["Saïda", "Saida", "سعيدة"] },
  { code: "21", names: ["Skikda", "سكيكدة"] },
  { code: "22", names: ["Sidi Bel Abbès", "Sidi Bel Abbes", "Sidi Belabbes", "سيدي بلعباس"] },
  { code: "23", names: ["Annaba", "Bône", "Bone", "Bona", "عنابة"] },
  { code: "24", names: ["Guelma", "قالمة"] },
  { code: "25", names: ["Constantine", "Qsentina", "Constantina", "قسنطينة"] },
  { code: "26", names: ["Médéa", "Medea", "المدية"] },
  { code: "27", names: ["Mostaganem", "مستغانم"] },
  { code: "28", names: ["M'Sila", "Msila", "المسيلة"] },
  { code: "29", names: ["Mascara", "معسكر"] },
  { code: "30", names: ["Ouargla", "Wargla", "ورقلة"] },
  { code: "31", names: ["Oran", "Wahran", "Ouahran", "وهران"] },
  { code: "32", names: ["El Bayadh", "Bayadh", "البيض"] },
  { code: "33", names: ["Illizi", "إليزي"] },
  { code: "34", names: ["Bordj Bou Arréridj", "Bordj Bou Arreridj", "BBA", "برج بوعريريج"] },
  { code: "35", names: ["Boumerdès", "Boumerdes", "بومرداس"] },
  { code: "36", names: ["El Tarf", "Tarf", "الطارف"] },
  { code: "37", names: ["Tindouf", "تندوف"] },
  { code: "38", names: ["Tissemsilt", "تيسمسيلت"] },
  { code: "39", names: ["El Oued", "Eloued", "Oued Souf", "الوادي"] },
  { code: "40", names: ["Khenchela", "خنشلة"] },
  { code: "41", names: ["Souk Ahras", "سوق أهراس"] },
  { code: "42", names: ["Tipaza", "تيبازة"] },
  { code: "43", names: ["Mila", "ميلة"] },
  { code: "44", names: ["Aïn Defla", "Ain Defla", "عين الدفلى"] },
  { code: "45", names: ["Naâma", "Naama", "النعامة"] },
  { code: "46", names: ["Aïn Témouchent", "Ain Temouchent", "Ain Témouchent", "عين تموشنت"] },
  { code: "47", names: ["Ghardaïa", "Ghardaia", "غرداية"] },
  { code: "48", names: ["Relizane", "Ghilizane", "غليزان"] },
  { code: "49", names: ["Timimoun", "تيميمون"] },
  { code: "50", names: ["Bordj Badji Mokhtar", "برج باجي مختار"] },
  { code: "51", names: ["Ouled Djellal", "أولاد جلال"] },
  { code: "52", names: ["Béni Abbès", "Beni Abbes", "بني عباس"] },
  { code: "53", names: ["In Salah", "عين صالح"] },
  { code: "54", names: ["In Guezzam", "عين قزام"] },
  { code: "55", names: ["Touggourt", "تقرت"] },
  { code: "56", names: ["Djanet", "جانت"] },
  { code: "57", names: ["El M'Ghair", "M'Ghair", "المغير"] },
  { code: "58", names: ["El Menia", "Menia", "المنيعة"] },
];

// Words that carry no place name ("wilaya d'Alger", "El Bayadh", "ولاية الجزائر").
const FILLER = new Set(["wilaya", "wilayat", "wilayet", "de", "du", "d", "el", "al", "la", "le", "ولاية"]);

// Accent-free, case-free, space-free form of a place name. Arabic letter variants are
// unified and the article "ال" is dropped, so "الجزائر" and "جزائر" compare equal.
function foldToken(token: string): string {
  let t = token.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  t = t.replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");
  t = t.replace(/ـ/g, "");
  if (/^ال\p{L}{2,}$/u.test(t)) t = t.slice(2);
  return t;
}

export function foldWilaya(input: string): string {
  const tokens = input
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return tokens
    .map((t) => t.toLowerCase())
    .filter((t) => !FILLER.has(t))
    .map(foldToken)
    .filter((t) => t.length > 0 && !FILLER.has(t))
    .join("");
}

const BY_NAME = new Map<string, string>();
for (const w of WILAYAS) {
  for (const n of w.names) BY_NAME.set(foldWilaya(n), w.code);
}

// Returns the canonical wilaya key ("01".."58") for a customer's spelling, or null.
export function normalizeWilaya(input: string): string | null {
  const raw = input.trim();
  // The code number, optionally written as "16", "016", "#16" or "wilaya 16".
  const digits = raw.match(/^(?:wilaya|wilayat|wilayet|ولاية|#|n°|no\.?)?\s*0*(\d{1,2})$/iu);
  if (digits) {
    const code = digits[1].padStart(2, "0");
    return WILAYAS.some((w) => w.code === code) ? code : null;
  }
  const folded = foldWilaya(raw);
  if (!folded) return null;
  return BY_NAME.get(folded) ?? null;
}

// Finds the store's own spelling for a customer's wilaya. An exact (trim, case-insensitive)
// match wins; otherwise the alias match is used. Returns null when nothing matches.
export function matchWilaya(input: string, storeNames: string[]): string | null {
  const exact = storeNames.find((n) => n.trim().toLowerCase() === input.trim().toLowerCase());
  if (exact !== undefined) return exact;
  const code = normalizeWilaya(input);
  if (!code) return null;
  return storeNames.find((n) => normalizeWilaya(n) === code) ?? null;
}

export const WILAYA_CODES = WILAYAS.map((w) => w.code);

// The Latin name the dashboard uses for a wilaya code (1..58), or null.
export function wilayaName(code: number): string | null {
  return WILAYAS.find((w) => w.code === String(code).padStart(2, "0"))?.names[0] ?? null;
}

// Every Latin-script spelling in the table (used by language.ts to ignore place names).
export function wilayaLatinNames(): string[] {
  return WILAYAS.flatMap((w) => w.names).filter((n) => !/[؀-ۿ]/u.test(n));
}

// Optimal string alignment distance (Damerau-Levenshtein with adjacent transpositions), over code points
// so Arabic-script names count one letter per character.
export function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const d: number[][] = [];
  for (let i = 0; i <= x.length; i++) d.push([i, ...new Array<number>(y.length).fill(0)]);
  for (let j = 0; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[x.length][y.length];
}

// Allowed edits for a typo: none under 4 letters, one for 4-7, two from 8. The shorter of the customer's
// text and the candidate name sets the length, so a short input never matches loosely.
function typoLimit(length: number): number {
  if (length >= 8) return 2;
  if (length >= 4) return 1;
  return 0;
}

const VARIANTS = WILAYAS.flatMap((w) => w.names.map((n) => ({ code: w.code, folded: foldWilaya(n) })));

// Codes of every wilaya with a spelling within the typo limit of the input, across all 58 wilayas
// (Latin and Arabic variants alike), sorted.
export function fuzzyWilayaCodes(input: string): string[] {
  const folded = foldWilaya(input);
  if (!folded) return [];
  const codes = new Set<string>();
  for (const v of VARIANTS) {
    const limit = typoLimit(Math.min(folded.length, v.folded.length));
    if (limit > 0 && editDistance(folded, v.folded) <= limit) codes.add(v.code);
  }
  return [...codes].sort();
}

export type WilayaResolution =
  | { status: "exact"; code: string }
  | { status: "corrected"; code: string; from: string }
  | { status: "ambiguous"; codes: string[] }
  | { status: "unknown" };

// Exact and variant spellings first. Otherwise a typo is corrected only when exactly one wilaya is within
// the typo limit; several candidates come back as a list so the bot can ask which one is meant.
export function resolveWilaya(input: string): WilayaResolution {
  const code = normalizeWilaya(input);
  if (code) return { status: "exact", code };
  const codes = fuzzyWilayaCodes(input);
  if (codes.length === 1) return { status: "corrected", code: codes[0], from: input.trim() };
  if (codes.length > 1) return { status: "ambiguous", codes };
  return { status: "unknown" };
}

// Matches a customer's wilaya against the store's own spellings (delivery_fees.wilaya).
export type StoreWilayaMatch =
  | { kind: "match"; name: string; corrected: boolean; from?: string }
  | { kind: "ambiguous"; names: string[] }
  | { kind: "not_served"; code: string }
  | { kind: "unknown" };

export function resolveStoreWilaya(input: string, storeNames: string[]): StoreWilayaMatch {
  const exact = storeNames.find((n) => n.trim().toLowerCase() === input.trim().toLowerCase());
  if (exact !== undefined) return { kind: "match", name: exact, corrected: false };
  const nameFor = (code: string) => storeNames.find((n) => normalizeWilaya(n) === code);
  const r = resolveWilaya(input);
  if (r.status === "unknown") return { kind: "unknown" };
  if (r.status === "ambiguous") {
    const names = r.codes.map(nameFor).filter((n): n is string => n !== undefined);
    return names.length === 0 ? { kind: "unknown" } : { kind: "ambiguous", names };
  }
  const name = nameFor(r.code);
  if (name === undefined) return { kind: "not_served", code: r.code };
  return r.status === "corrected"
    ? { kind: "match", name, corrected: true, from: r.from }
    : { kind: "match", name, corrected: false };
}
