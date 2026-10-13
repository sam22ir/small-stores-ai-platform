// Pasted API ID / tokens often carry spaces, newlines or invisible characters from copy-paste.
// Yalidine would reject them, so they are removed before the credential is sent.
const JUNK = /[\s\u200b-\u200d\u2060\ufeff]/g;

export function cleanCredential(s: string): string {
  return s.replace(JUNK, "");
}

// Lowercase, accents removed, and every other punctuation mark (apostrophes, hyphens, commas) becomes a space,
// so "M'Sila", "Sidi-Bel-Abbès" and "Rue 5, Oran" compare as whole words.
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// Finds the wilaya named in a free-text address. `names` is the ordered wilaya list (WILAYAS), so the
// 1-based position is the wilaya code. Returns that code, or null. The longest name wins, so
// "Sidi Bel Abbès" beats "Sidi" and "Aïn Defla" beats "Ain".
export function guessWilaya(text: string, names: readonly string[]): number | null {
  const haystack = ` ${fold(text)} `;
  let best = -1;
  let bestLength = 0;
  names.map(fold).forEach((name, i) => {
    if (name.length > bestLength && haystack.includes(` ${name} `)) {
      best = i;
      bestLength = name.length;
    }
  });
  return best === -1 ? null : best + 1;
}
