// Parses a pasted or uploaded stock list (CSV, semicolon- or tab-separated, e.g. copied from a
// spreadsheet) into products with options. Pure functions: no network, easy to test.

export type ImportRow = {
  line: number; // 1-based line in the pasted text
  name: string;
  option: string; // "" means the default option
  priceCents: number | null; // null = not given
  stock: number | null; // null = not given
  description: string;
  aliases: string;
};

export type ImportError = { line: number; reason: "name" | "price" | "stock" };

export type ImportResult = { rows: ImportRow[]; errors: ImportError[] };

type Col = "name" | "price" | "stock" | "option" | "description" | "aliases";

const HEADERS: Record<Col, string[]> = {
  name: ["name", "product", "item", "nom", "produit", "article", "اسم", "المنتج"],
  price: ["price", "prix", "tarif", "سعر", "السعر"],
  stock: ["stock", "qty", "quantity", "quantite", "quantité", "qte", "qté", "كمية", "الكمية"],
  option: ["option", "variant", "variante", "size", "taille", "color", "colour", "couleur", "مقاس", "لون"],
  description: ["description", "desc", "détails", "details", "وصف"],
  aliases: ["aliases", "alias", "other names", "autres noms", "synonyms"],
};
const DEFAULT_ORDER: Col[] = ["name", "price", "stock", "option", "description", "aliases"];

function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? "";
  if (first.includes("\t")) return "\t";
  if (first.includes(";")) return ";";
  return ",";
}

// Minimal CSV line splitter: handles "quoted, values" and doubled quotes.
function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// "4500", "4 500", "4500 DA", "4,500.50", "4500,5" -> cents; null when not a price.
export function parseMoney(input: string): number | null {
  let s = input.replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function headerColumns(cells: string[]): Col[] | null {
  const cols = cells.map((c) => {
    const k = c.trim().toLowerCase();
    return (Object.keys(HEADERS) as Col[]).find((col) => HEADERS[col].includes(k)) ?? null;
  });
  // A header row has a recognised name column and no cell that looks like data.
  if (!cols.includes("name") || cols.filter(Boolean).length < Math.min(2, cells.length)) return null;
  return cols.map((c, i) => c ?? DEFAULT_ORDER[i] ?? "description");
}

export function parseImport(text: string): ImportResult {
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];
  const delim = detectDelimiter(text);
  let order: Col[] = DEFAULT_ORDER;
  let started = false;

  text.split(/\r?\n/).forEach((raw, idx) => {
    if (!raw.trim()) return;
    const cells = splitLine(raw, delim);
    if (!started) {
      started = true;
      const header = headerColumns(cells);
      if (header) { order = header; return; }
    }
    const get = (col: Col) => {
      const i = order.indexOf(col);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const line = idx + 1;
    const name = get("name");
    if (!name) { errors.push({ line, reason: "name" }); return; }

    const priceText = get("price");
    const priceCents = priceText === "" ? null : parseMoney(priceText);
    if (priceText !== "" && priceCents === null) { errors.push({ line, reason: "price" }); return; }

    const stockText = get("stock");
    let stock: number | null = null;
    if (stockText !== "") {
      if (!/^\d{1,7}$/.test(stockText)) { errors.push({ line, reason: "stock" }); return; }
      stock = Number(stockText);
    }
    rows.push({
      line, name: name.slice(0, 120), option: get("option").slice(0, 60), priceCents, stock,
      description: get("description").slice(0, 500), aliases: get("aliases").slice(0, 300),
    });
  });
  return { rows, errors };
}

export type ImportProduct = {
  name: string;
  priceCents: number | null;
  description: string;
  aliases: string;
  options: { label: string; stock: number | null; priceCents: number | null }[];
};

// Rows with the same product name become one product with several options.
export function groupRows(rows: ImportRow[]): ImportProduct[] {
  const byName = new Map<string, ImportProduct>();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    let p = byName.get(key);
    if (!p) {
      p = { name: r.name, priceCents: null, description: "", aliases: "", options: [] };
      byName.set(key, p);
    }
    if (r.description && !p.description) p.description = r.description;
    if (r.aliases && !p.aliases) p.aliases = r.aliases;
    const label = r.option;
    const existing = p.options.find((o) => o.label.toLowerCase() === label.toLowerCase());
    // The product's own price is the first price given; later rows with a different price
    // become that option's own price.
    if (r.priceCents !== null && p.priceCents === null) p.priceCents = r.priceCents;
    const optionPrice = r.priceCents !== null && r.priceCents !== p.priceCents ? r.priceCents : null;
    if (existing) {
      if (r.stock !== null) existing.stock = r.stock;
      if (optionPrice !== null) existing.priceCents = optionPrice;
    } else {
      p.options.push({ label, stock: r.stock, priceCents: optionPrice });
    }
  }
  return [...byName.values()];
}
