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
