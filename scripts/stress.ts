// Run the stress-test set (data/stress-*.json) through the SAME classify() as everything else.
// File-based: it never reads or writes the database, so test cases can't appear in the app's lists.
//
//   npm run stress -- --split=dev                          the 33 dev cases with the active model
//   npm run stress -- --split=dev --model=qwen-3.8-27b     a fast, cheap SCREEN on another model (never reported)
//   npm run stress -- --only=S01,S02                       just these cases
//   npm run stress -- --split=locked --locked              the 20 locked cases: once per prompt version, at the end
//
// Writes eval/stress-<prompt version>-<model>-<split>.json. The locked set refuses to run without --locked, and refuses a
// second run for the same prompt version and model without --force: tuning on it would make the result meaningless.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { classify } from "../src/lib/classifier/classify";
import { llmProvider } from "../src/lib/classifier/providers";
import { acceptableFor, modelDisplayed, passes, summarizeStress, type StressLabel, type StressRow, type StressRun } from "../src/lib/stress";

const args = process.argv.slice(2);
const flag = (n: string) => args.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));
const value = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

const model = value("model") ?? process.env.CLASSIFIER_MODEL ?? "";
const promptVersion = process.env.PROMPT_VERSION ?? "";
if (!model || !promptVersion) throw new Error("CLASSIFIER_MODEL and PROMPT_VERSION must be set");
const splitArg = (value("split") ?? "dev") as "dev" | "locked" | "all";
if (!["dev", "locked", "all"].includes(splitArg)) throw new Error("--split must be dev, locked or all");
const only = value("only")?.split(",").map((s) => s.trim().toUpperCase());
// The provider allows 5 requests a minute on gpt-oss-120b (13 s apart); qwen allows 300 (a quarter second is plenty).
const interval = Number(value("interval") ?? (model.includes("qwen") ? 250 : 13_000));

const labels = JSON.parse(readFileSync("data/stress-labels.json", "utf8")) as StressLabel[];
const replies = JSON.parse(readFileSync("data/stress-replies.json", "utf8")) as {
  id: string; body: string; received_at: string; invoice: { number: string; amount: number; currency: string; due_date: string };
}[];

let selected = labels.filter((l) => splitArg === "all" || l.split === splitArg);
if (only) selected = labels.filter((l) => only.includes(l.id));
const touchesLocked = selected.some((l) => l.split === "locked");

const outName = `eval/stress-${promptVersion}-${model.replaceAll("/", "-")}-${only ? "custom" : splitArg}.json`;
if (touchesLocked) {
  if (!flag("locked")) throw new Error("This includes locked cases. Pass --locked to run them: once per prompt version, at the end, never tuned on.");
  const lockedFile = `eval/stress-${promptVersion}-${model.replaceAll("/", "-")}-locked.json`;
  if (existsSync(lockedFile) && !flag("force")) {
    throw new Error(`${lockedFile} already exists: the locked set runs once per prompt version and model. Pass --force only if you accept that.`);
  }
}

console.log(`Stress run | model ${model} | prompt ${promptVersion} | ${selected.length} cases (${only ? "custom" : splitArg}) | ${interval} ms apart`);
const provider = llmProvider({ maxRateLimitWaitMs: 180_000 });
const rows: StressRow[] = [];
const tokens = { prompt: 0, completion: 0 };
const detail = !touchesLocked; // per-case lines are for dev cases; locked runs print only totals

for (const [i, label] of selected.entries()) {
  const reply = replies.find((r) => r.id === label.id)!;
  const result = await classify(
    { body: reply.body, invoiceNumber: reply.invoice.number, invoiceAmount: reply.invoice.amount, currency: reply.invoice.currency, dueDate: reply.invoice.due_date, receivedAt: new Date(reply.received_at) },
    { model, provider },
  );
  tokens.prompt += result.promptTokens ?? 0;
  tokens.completion += result.completionTokens ?? 0;

  const row: StressRow = {
    id: label.id,
    group: label.group,
    rule: label.rule,
    pair: label.pair,
    split: label.split,
    body: reply.body,
    label: label.display_category,
    acceptable: acceptableFor(label),
    model: modelDisplayed(result.policy.modelCategory, result.policy.modelRank),
    final: result.policy.finalCategory,
    error: result.error,
    reasoning: result.rawOutput?.reasoning ?? null,
    overrideReasons: result.policy.overrideReasons,
    quote: result.rawOutput?.evidence_quote ?? null,
    quoteExact: result.rawOutput ? result.rawOutput.evidence_quote.trim() !== "" && reply.body.includes(result.rawOutput.evidence_quote.trim()) : null,
  };
  rows.push(row);
  if (detail) {
    const mark = row.error ? "ERROR" : passes(row) ? "pass" : "FAIL";
    console.log(`[${i + 1}/${selected.length}] ${row.id}  label ${row.label}${row.acceptable.length > 1 ? ` (or ${row.acceptable.filter((a) => a !== row.label).join("/")})` : ""} -> ${row.final}  ${mark}${row.error ? `  (${row.error.slice(0, 70)})` : ""}`);
  }
  if (i < selected.length - 1) await new Promise((r) => setTimeout(r, interval));
}

const summary = summarizeStress(rows);
console.log(`\nPassed ${summary.passed}/${summary.scored}${summary.errors ? `, ${summary.errors} failed to run` : ""} | exact ${summary.exact} | model alone ${summary.modelPassed} | false paid ${summary.falsePaid.length}${summary.falsePaid.length ? ` (${summary.falsePaid.join(", ")})` : ""} | ${tokens.prompt + tokens.completion} tokens`);
console.log("By group:");
for (const g of summary.byGroup) console.log(`  ${g.group.padEnd(22)} ${g.passed}/${g.total}`);
console.log(`Minimal pairs fully passed: ${summary.pairs.filter((p) => p.passed).length}/${summary.pairs.length}`);
if (detail && summary.failures.length) {
  console.log("\nFailures:");
  for (const r of summary.failures) console.log(`  ${r.id} [${r.group}] label ${r.label} -> ${r.final}${r.overrideReasons.length ? ` (rules: ${r.overrideReasons.join(", ")})` : ""}\n     ${JSON.stringify(r.body.slice(0, 110))}\n     ${(r.reasoning ?? "").slice(0, 170)}`);
}

if (!flag("no-write")) {
  mkdirSync("eval", { recursive: true });
  const run: StressRun = { kind: "stress", split: only ? "all" : splitArg, model, promptVersion, generatedAt: new Date().toISOString(), tokens: { ...tokens, total: tokens.prompt + tokens.completion }, summary, rows };
  writeFileSync(outName, JSON.stringify(run, null, 2) + "\n");
  console.log(`\nWrote ${outName}`);
}
