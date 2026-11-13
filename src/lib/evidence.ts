// Checks that what the model extracted is actually in the reply (POLICY.md section 4, rules 2 and 3).
// Plain functions: no network, no database, no environment variables.

/**
 * An amount in whole cents. Postgres numeric can arrive as a string ("3500.00"), so amounts are
 * always converted explicitly and compared as integers, never as raw values or floats.
 */
export function cents(x: number | string): number {
  // A string with no digits is not an amount: Number("") would silently be 0.
  if (typeof x === "string" && !/\d/.test(x)) return NaN;
  const n = typeof x === "number" ? x : Number(x.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function sameAmount(a: number | string, b: number | string): boolean {
  const ca = cents(a);
  const cb = cents(b);
  return Number.isFinite(ca) && ca === cb;
}

/**
 * Lowercased, curly quotes and dashes straightened, spacing collapsed. Used only by the "normalized" quote match: it
 * forgives a changed first letter or a typographic quote, but NOT a paraphrase or an invented quote.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export type QuoteMatch = "exact" | "normalized";

/**
 * POLICY.md section 4, rule 4: the evidence quote must be an exact substring of the body (only the quote's ends are
 * trimmed). "normalized" is an experimental, more forgiving match (see normalizeForMatch); "exact" is the policy.
 */
export function quoteInBody(quote: string | null | undefined, body: string, mode: QuoteMatch = "exact"): boolean {
  const q = (quote ?? "").trim();
  if (q.length === 0) return false;
  return mode === "exact" ? body.includes(q) : normalizeForMatch(body).includes(normalizeForMatch(q));
}

// A number as written: "3,150", "3150", "3,150.00", "615.50", "3.150,00", "1 840".
const NUMBER_TOKEN = /\d{1,3}(?:[,.  ]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;

/**
 * Every amount written in the text, in cents. Each number is read both the US way ("3,150.00")
 * and the European way ("3.150,00") since replies can be in any language. Reading too many
 * candidates only makes the check more lenient for that one number; it can't invent a payment.
 */
export function amountsInText(text: string): Set<number> {
  const found = new Set<number>();
  for (const [token] of text.matchAll(NUMBER_TOKEN)) {
    const plain = token.replace(/[  ]/g, "");
    // US: commas group thousands, dot is decimal.
    found.add(cents(plain.replace(/,/g, "")));
    // European: dots group thousands, comma is decimal.
    found.add(cents(plain.replace(/\./g, "").replace(",", ".")));
  }
  found.delete(NaN);
  return found;
}

/** Rule 2: an extracted amount must appear in the reply body. */
export function amountInText(amount: number, text: string): boolean {
  return amountsInText(text).has(cents(amount));
}

/** Invoice numbers compared loosely on format: "INV-2304", "inv 2304" and "#2304" all match INV-2304. */
export function sameInvoiceNumber(mentioned: string, invoiceNumber: string): boolean {
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const a = norm(mentioned);
  const b = norm(invoiceNumber);
  if (a === b) return true;
  // The customer wrote only the number part ("invoice 2304"): compare digits.
  const digits = (s: string) => s.replace(/\D/g, "");
  return /^\d+$/.test(a) && a === digits(b);
}
