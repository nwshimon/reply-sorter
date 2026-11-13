// Regenerates src/lib/classifier/policy-text.generated.ts from POLICY.md (sections 2, 3, 6).
// Run after any POLICY.md change: npm run gen:policy. A test fails if the file is stale.
// Reads POLICY.md only; never writes to it.
import { readFileSync, writeFileSync } from "node:fs";
import { extractPromptPolicy } from "../src/lib/classifier/policy-extract";

const text = extractPromptPolicy(readFileSync("POLICY.md", "utf8"));
const out =
  "// GENERATED from POLICY.md sections 2, 3 and 6 by scripts/gen-policy-text.ts. Do not edit by hand.\n" +
  `export const POLICY_PROMPT_TEXT = ${JSON.stringify(text)};\n`;
writeFileSync("src/lib/classifier/policy-text.generated.ts", out);
console.log(`Wrote policy-text.generated.ts (${text.length} characters)`);
