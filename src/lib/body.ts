// Splits a reply into the customer's own words and the quoted earlier email below it (POLICY.md section 2, rule 1:
// only the customer's own words count). A forwarded remittance advice is NOT treated as quoted: it counts as evidence.
// Pure function.

const QUOTE_STARTS: RegExp[] = [
  /(^|\n)[ \t]*>/, // a line starting with ">"
  /[ \t]>[ \t]*On [^\n]{0,160}?wrote:/, // flattened: "thanks! > On Mon, Nov 9 ... wrote: > Hi"
  /(^|\n)On [^\n]{0,160}?wrote:/, // "On Mon, Nov 9, 2026, X wrote:"
  /-{3,}\s*Original Message\s*-{3,}/i,
];

export function splitQuoted(body: string): { own: string; quoted: string } {
  let cut = -1;
  for (const re of QUOTE_STARTS) {
    const m = re.exec(body);
    if (!m) continue;
    // Start at the first non-space character of the match.
    const idx = m.index + m[0].length - m[0].trimStart().length;
    if (cut === -1 || idx < cut) cut = idx;
  }
  if (cut === -1) return { own: body, quoted: "" };
  return { own: body.slice(0, cut).trimEnd(), quoted: body.slice(cut).trim() };
}
