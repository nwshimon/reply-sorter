// Pulls POLICY.md sections 2, 3 and 5 out of the markdown, word for word, for the model prompt.
// Used by scripts/gen-policy-text.ts (writes policy-text.generated.ts) and by a test that fails
// if the generated file has drifted from POLICY.md. Pure function: no file or network access.

/** The text of `## <n>. …` up to the next `## ` heading, without the trailing `---` rule. */
export function extractSection(md: string, n: number): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^## ${n}\\.\\s`).test(l));
  if (start < 0) throw new Error(`POLICY.md has no section ${n}`);
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines
    .slice(start, end)
    .join("\n")
    .replace(/\n+---\s*$/, "")
    .trim();
}

/** Sections 2 (rules), 3 (categories) and 5 (suspicious replies), in order. */
export function extractPromptPolicy(md: string): string {
  return [2, 3, 5].map((n) => extractSection(md, n)).join("\n\n");
}
