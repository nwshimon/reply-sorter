// Compare two runs reply by reply, with a regression GATE. No model calls, no database writes.
//
//   npm run compare -- --given=v2,v3                       the 40 given replies, two prompt versions (from the database)
//   npm run compare -- --stress=stress-v2-qwen-3.8-27b-dev,stress-v3-qwen-3.8-27b-dev     two saved stress runs
//
// Prints every change, whether the MODEL's own answer or a CODE RULE caused it, and exits with status 1 if any reply that
// was right before is wrong now. Adopt a change only if the gate passes.
import { readFileSync } from "node:fs";
import { currentResultRows, repliesBySource } from "../src/db/queries";
import { diffRuns, type Comparison, type RunRow } from "../src/lib/compare";
import type { Category } from "../src/lib/categories";
import { acceptableFor, modelDisplayed, type StressLabel, type StressRun } from "../src/lib/stress";

const args = process.argv.slice(2);
const value = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const model = value("model") ?? process.env.CLASSIFIER_MODEL ?? "";

function print(title: string, c: Comparison) {
  console.log(`\n${title}: ${c.compared} replies compared | right before ${c.passedBefore} -> right now ${c.passedAfter} | ${c.fixes.length} fixed, ${c.regressions.length} regressed`);
  for (const ch of c.changes) {
    const tag = ch.kind === "regression" ? "REGRESSION" : ch.kind === "fix" ? "fixed     " : "moved     ";
    console.log(`  ${tag} ${ch.id.padEnd(4)} ${ch.before} -> ${ch.after}   cause: ${ch.source}${ch.source === "model" ? ` (${ch.modelBefore} -> ${ch.modelAfter})` : ` (the model said ${ch.modelAfter} both times)`}`);
  }
  if (c.hiddenModelChanges.length) console.log(`  note: the model's own answer changed on ${c.hiddenModelChanges.map((i) => "#" + i).join(", ")} without changing what is shown`);
}

let regressions = 0;

const given = value("given");
if (given) {
  const [va, vb] = given.split(",");
  if (!va || !vb) throw new Error("--given=<older>,<newer>");
  const labels = new Map((JSON.parse(readFileSync("data/labels.json", "utf8")) as { id: string; display_category: Category }[]).map((l) => [l.id, l.display_category]));
  const dataset = new Set((await repliesBySource("dataset")).map((r) => r.id));
  const load = async (promptVersion: string): Promise<RunRow[]> =>
    (await currentResultRows({ model, promptVersion }))
      .filter((r) => dataset.has(r.replyId) && labels.has(r.replyId))
      .map((r) => ({ id: r.replyId, acceptable: [labels.get(r.replyId)!], model: modelDisplayed(r.modelCategory, r.modelRank), modelKey: `${r.modelCategory} ${r.modelRank}`, final: r.finalCategory }));
  const c = diffRuns(await load(va), await load(vb));
  print(`Given data, ${model}: ${va} -> ${vb}`, c);
  regressions += c.regressions.length;
}

const stress = value("stress");
if (stress) {
  const [fa, fb] = stress.split(",");
  if (!fa || !fb) throw new Error("--stress=<older file>,<newer file> (names in eval/, without .json)");
  const labels = new Map((JSON.parse(readFileSync("data/stress-labels.json", "utf8")) as StressLabel[]).map((l) => [l.id, l]));
  const load = (f: string): RunRow[] =>
    (JSON.parse(readFileSync(`eval/${f}.json`, "utf8")) as StressRun).rows
      .filter((r) => r.error === null && labels.has(r.id))
      .map((r) => ({ id: r.id, acceptable: acceptableFor(labels.get(r.id)!), model: r.model, modelKey: r.raw ? `${r.raw.category} ${r.raw.rank}` : undefined, final: r.final }));
  const c = diffRuns(load(fa), load(fb));
  print(`Stress: ${fa} -> ${fb}`, c);
  regressions += c.regressions.length;
}

if (!given && !stress) throw new Error("pass --given=<v>,<v> and/or --stress=<file>,<file>");
console.log(`\nGATE: ${regressions === 0 ? "PASS (nothing that was right is now wrong)" : `FAIL (${regressions} regression${regressions === 1 ? "" : "s"})`}`);
process.exit(regressions === 0 ? 0 : 1);
