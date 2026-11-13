// Classify the dataset (or held-out) replies with the model and store every result.
//
//   npm run classify                          the 40 dataset replies; skips ones already done
//   npm run classify -- --only=09,20,36       just these ids
//   npm run classify -- --mismatches --sample=5   rerun the stored mismatches + 5 that were correct
//   npm run classify -- --force               redo even if a result exists
//   npm run classify -- --budget=60000        stop after this many tokens (default 120000)
//   npm run classify:heldout                  the 12 held-out replies (final prompt version, 120b)
//
// The model and prompt version come from CLASSIFIER_MODEL and PROMPT_VERSION. One reply at a time,
// ~25 s apart, waiting out 429s. Failed calls are stored (as needs_human / classifier_error) but
// don't count as done, so the next run retries them.
import { readFileSync } from "node:fs";
import { classify } from "../src/lib/classifier/classify";
import { groqProvider } from "../src/lib/classifier/providers";
import {
  currentResultRows,
  doneReplyIds,
  getActiveRun,
  replyToInput,
  repliesBySource,
  saveClassification,
} from "../src/db/queries";

const args = process.argv.slice(2);
const flag = (name: string) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const heldout = flag("heldout");
const force = flag("force");
const only = value("only")?.split(",").map((s) => s.trim().toUpperCase().replace(/^H?(\d+)$/, (_m, n) => (heldout ? `H${n}` : n)));
const budget = Number(value("budget") ?? 120_000);
const sample = Number(value("sample") ?? 5);
const PAUSE_MS = 25_000;

const run = getActiveRun();
const labelsFile = heldout ? "data/heldout-labels.json" : "data/labels.json";
const labels = new Map(
  (JSON.parse(readFileSync(labelsFile, "utf8")) as { id: string; v0_category: string }[]).map((l) => [l.id, l.v0_category]),
);

let candidates = await repliesBySource(heldout ? "heldout" : "dataset");
const done = await doneReplyIds(run);

if (only) {
  candidates = candidates.filter((r) => only.includes(r.id));
  const missing = only.filter((id) => !candidates.some((r) => r.id === id));
  if (missing.length) console.log(`No such reply: ${missing.join(", ")}`);
} else if (flag("mismatches")) {
  // Rerun what the stored results got wrong, plus a few right ones as a check that nothing else broke.
  const current = new Map((await currentResultRows(run)).map((r) => [r.replyId, r.finalCategory]));
  const wrong = candidates.filter((r) => current.has(r.id) && current.get(r.id) !== labels.get(r.id));
  const right = candidates.filter((r) => current.has(r.id) && current.get(r.id) === labels.get(r.id)).slice(0, sample);
  console.log(`Mismatches: ${wrong.map((r) => r.id).join(", ") || "none"}; plus ${right.length} that were correct`);
  candidates = [...wrong, ...right];
} else if (!force) {
  candidates = candidates.filter((r) => !done.has(r.id));
}
// --only and --mismatches are explicit selections, so they always re-run; --force matters for the full run.

console.log(`Model: ${run.model} | prompt version: ${run.promptVersion} | ${candidates.length} to classify | budget ${budget} tokens`);
if (candidates.length === 0) {
  console.log("Nothing to do (everything already has a result for this model and prompt version; use --force to redo).");
  process.exit(0);
}

// Waits out 429s (up to 3 minutes per call); one retry on timeouts and 5xx.
const provider = groqProvider({ maxRateLimitWaitMs: 180_000 });

let totalTokens = 0;
let failed = 0;
let mismatched = 0;
const started = Date.now();
for (const [i, reply] of candidates.entries()) {
  if (totalTokens >= budget) {
    console.log(`Budget of ${budget} tokens reached; stopping before ${reply.id}. Run again to continue.`);
    break;
  }
  const result = await classify(replyToInput(reply), { provider });
  await saveClassification(reply.id, result);

  totalTokens += (result.promptTokens ?? 0) + (result.completionTokens ?? 0);
  const label = labels.get(reply.id);
  const finalCat = result.policy.finalCategory;
  if (result.error) failed++;
  else if (label && finalCat !== label) mismatched++;
  const mark = result.error ? "FAILED" : label === finalCat ? "ok" : `MISMATCH (label: ${label})`;
  console.log(
    `[${i + 1}/${candidates.length}] #${reply.id}  model: ${result.rawOutput ? `${result.rawOutput.category} ${result.rawOutput.rank}` : "-"}  final: ${finalCat}` +
      `${result.policy.overrideReasons.length ? `  rules: ${result.policy.overrideReasons.join(",")}` : ""}  ${mark}` +
      `${result.error ? `  (${result.error})` : ""}  | tokens so far: ${totalTokens}`,
  );

  if (i < candidates.length - 1) await new Promise((r) => setTimeout(r, PAUSE_MS));
}
console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s: ${totalTokens} tokens, ${failed} failed, ${mismatched} differ from my labels.`);
