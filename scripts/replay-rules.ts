// Replay the code rules over STORED model outputs: what would each rule variant have shown? No model calls, no writes.
// A rule change costs nothing to test this way; only a prompt or wording change needs the model again.
//
//   npm run replay -- --given=v2,v3 --stress=stress-v2-qwen-3.8-27b-dev,stress-v2-gpt-oss-120b-dev
//
// Variants (POLICY.md section 4, rules 4 and 5; the first is the policy as written):
//   current            the evidence quote must be an exact copy; any amount not in the reply is low confidence
//   quote normalized   the quote may differ in letter case, spacing or curly quotes (never in words)
//   amount paid-only   an amount not in the reply only counts as low confidence when the model said paid
//   both               both of the above
import { readFileSync } from "node:fs";
import { currentResultRows, repliesBySource } from "../src/db/queries";
import { policyFromRaw } from "../src/lib/classifier/classify";
import { ModelOutput } from "../src/lib/classifier/schema";
import type { Category } from "../src/lib/categories";
import type { PolicyOptions } from "../src/lib/policy";
import { acceptableFor, type StressLabel, type StressRun } from "../src/lib/stress";

const args = process.argv.slice(2);
const value = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const model = value("model") ?? process.env.CLASSIFIER_MODEL ?? "";

const VARIANTS: { name: string; options: PolicyOptions }[] = [
  { name: "current (the policy)", options: {} },
  { name: "quote normalized", options: { quoteMatch: "normalized" } },
  { name: "amount paid-only", options: { amountFailure: "paid-only" } },
  { name: "both", options: { quoteMatch: "normalized", amountFailure: "paid-only" } },
];

type Item = { id: string; raw: ModelOutput; ctx: { body: string; invoiceNumber: string; invoiceAmount: number; receivedAt: Date }; acceptable: Category[] };
const datasets: { name: string; items: Item[]; skipped: number }[] = [];

const given = value("given");
if (given) {
  const labels = new Map((JSON.parse(readFileSync("data/labels.json", "utf8")) as { id: string; display_category: Category }[]).map((l) => [l.id, l.display_category]));
  const replies = new Map((await repliesBySource("dataset")).map((r) => [r.id, r]));
  for (const promptVersion of given.split(",")) {
    const items: Item[] = [];
    for (const r of await currentResultRows({ model, promptVersion })) {
      const reply = replies.get(r.replyId);
      const parsed = ModelOutput.safeParse(r.rawOutput);
      if (!reply || !parsed.success || !labels.has(r.replyId)) continue;
      items.push({ id: r.replyId, raw: parsed.data, ctx: { body: reply.body, invoiceNumber: reply.invoiceNumber, invoiceAmount: reply.invoiceAmount, receivedAt: reply.receivedAt }, acceptable: [labels.get(r.replyId)!] });
    }
    datasets.push({ name: `given 40, ${model}, prompt ${promptVersion}`, items, skipped: 0 });
  }
}

const stress = value("stress");
if (stress) {
  const labels = new Map((JSON.parse(readFileSync("data/stress-labels.json", "utf8")) as StressLabel[]).map((l) => [l.id, l]));
  const replies = new Map((JSON.parse(readFileSync("data/stress-replies.json", "utf8")) as { id: string; body: string; received_at: string; invoice: { number: string; amount: number } }[]).map((r) => [r.id, r]));
  for (const file of stress.split(",")) {
    const run = JSON.parse(readFileSync(`eval/${file}.json`, "utf8")) as StressRun;
    const items: Item[] = [];
    let skipped = 0;
    for (const row of run.rows) {
      const reply = replies.get(row.id), label = labels.get(row.id);
      if (!row.raw || !reply || !label) { skipped++; continue; }
      items.push({ id: row.id, raw: row.raw, ctx: { body: reply.body, invoiceNumber: reply.invoice.number, invoiceAmount: reply.invoice.amount, receivedAt: new Date(reply.received_at) }, acceptable: acceptableFor(label) });
    }
    datasets.push({ name: `stress ${run.split}, ${run.model}, prompt ${run.promptVersion}`, items, skipped });
  }
}
if (datasets.length === 0) throw new Error("pass --given=<v>[,<v>] and/or --stress=<file>[,<file>]");

for (const d of datasets) {
  console.log(`\n=== ${d.name}: ${d.items.length} replies${d.skipped ? ` (${d.skipped} without a stored raw output skipped)` : ""}`);
  const base = new Map<string, Category>();
  for (const [vi, v] of VARIANTS.entries()) {
    let right = 0;
    const falsePaid: string[] = [];
    const moved: string[] = [];
    for (const it of d.items) {
      const final = policyFromRaw(it.raw, it.ctx, v.options).finalCategory;
      if (it.acceptable.includes(final)) right++;
      if (final === "paid" && !it.acceptable.includes("paid")) falsePaid.push(it.id);
      if (vi === 0) base.set(it.id, final);
      else if (final !== base.get(it.id)) moved.push(`${it.id} ${base.get(it.id)}->${final} ${it.acceptable.includes(final) ? "(right)" : "(wrong)"}`);
    }
    console.log(`  ${v.name.padEnd(22)} ${right}/${d.items.length} right (${Math.round((100 * right) / d.items.length)}%) | false paid ${falsePaid.length}${falsePaid.length ? ` (${falsePaid.join(", ")})` : ""}${moved.length ? `\n      changes vs current: ${moved.join("; ")}` : ""}`);
  }
}
