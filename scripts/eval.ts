// Score the stored results against MY labels (never against corrections). No model calls.
//
//   npm run eval                 the 40 dataset replies, for the active CLASSIFIER_MODEL + PROMPT_VERSION
//   npm run eval -- --heldout    the 12 held-out replies (reported separately)
//   npm run eval -- --no-write   print only
//
// Writes eval/results-<PROMPT_VERSION>-<model>.json (heldout-results-… for the held-out set).
import { mkdirSync, writeFileSync } from "node:fs";
import { buildEval, resultsFileName } from "../src/db/eval";
import { getActiveRun } from "../src/db/queries";
import { CATEGORIES, CATEGORY_LABELS } from "../src/lib/categories";
import { pct, type SystemScore } from "../src/lib/metrics";

const set = process.argv.includes("--heldout") ? "heldout" : "dataset";
const result = await buildEval(getActiveRun(), set);
const m = result.metrics;

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const padL = (s: string | number, n: number) => String(s).padStart(n);

function printSystem(title: string, s: SystemScore) {
  console.log(`\n${title}`);
  console.log(`  ${pad("category", 16)} ${padL("n", 3)} ${padL("pred", 5)} ${padL("prec", 6)} ${padL("recall", 7)}`);
  for (const c of s.perCategory) {
    console.log(`  ${pad(CATEGORY_LABELS[c.category], 16)} ${padL(c.support, 3)} ${padL(c.predicted, 5)} ${padL(pct(c.precision), 6)} ${padL(pct(c.recall), 7)}`);
  }
  console.log(`  accuracy ${pct(s.accuracy)} | FALSE PAID: ${s.falsePaid.count}${s.falsePaid.count ? ` (${s.falsePaid.ids.map((i) => `#${i}`).join(", ")})` : ""} | missed paid: ${s.missedPaid.count}`);
}

console.log(`\n=== ${set === "heldout" ? "HELD-OUT set" : "Dataset"} | model ${result.model} | prompt ${result.promptVersion} ===`);
const cov = m.coverage;
console.log(`Coverage: ${cov.scored}/${cov.total}${cov.failed ? `, ${cov.failed} failed` : ""}${cov.missing ? `, ${cov.missing} not run` : ""}${cov.scored < cov.total ? "   <-- PARTIAL RUN" : ""}`);
console.log(`Tokens spent on this run: ${result.tokens.total} (${result.tokens.prompt} prompt + ${result.tokens.completion} completion)`);

printSystem("Model alone (before the code rules)", m.model);
printSystem("After the code rules (what the app shows)", m.final);

console.log("\nConfusion matrix, after rules (rows = my label, columns = system):");
const abbr = (c: string) => c.replace("_", " ").slice(0, 6);
console.log(`  ${pad("", 16)} ${CATEGORIES.map((c) => padL(abbr(c), 7)).join("")}`);
for (const l of CATEGORIES) console.log(`  ${pad(CATEGORY_LABELS[l], 16)} ${CATEGORIES.map((p) => padL(m.final.confusion[l][p] || ".", 7)).join("")}`);

console.log(`\nReview rate: ${m.reviewed}/${cov.scored} (${pct(m.reviewRate)}) sent to a person`);
console.log(`Wrong answers: ${m.wrong}; of those NOT in the review queue (nobody would see them): ${m.wrongNotReviewed.count}${m.wrongNotReviewed.count ? ` (${m.wrongNotReviewed.ids.map((i) => `#${i}`).join(", ")})` : ""}`);
console.log(`Code rules changed ${m.rulesChanged.count} answer(s): ${m.rulesChanged.fixed.length} became correct, ${m.rulesChanged.broke.length} became wrong${m.rulesChanged.broke.length ? ` (${m.rulesChanged.broke.map((i) => `#${i}`).join(", ")})` : ""}`);

if (m.mismatches.length) {
  console.log(`\nEvery mismatch (${m.mismatches.length}):`);
  for (const r of m.mismatches) {
    console.log(`  #${r.id}  mine: ${r.label} | model alone: ${r.model} | final: ${r.final} | review: ${r.needsReview ? r.reviewReasons.join(",") : "no"}`);
    console.log(`      body: ${JSON.stringify(r.body.length > 160 ? r.body.slice(0, 160) + "…" : r.body)}`);
    console.log(`      reasoning: ${r.reasoning ?? "-"}${r.overrideReasons.length ? `\n      rules: ${r.overrideReasons.join(", ")}` : ""}`);
  }
}

if (!process.argv.includes("--no-write")) {
  mkdirSync("eval", { recursive: true });
  const file = `eval/${resultsFileName(result)}`;
  writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
  console.log(`\nWrote ${file}`);
}
