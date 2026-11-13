// Re-run the code rules (policy.ts, evidence.ts, dates.ts) on stored model answers. NO model calls.
// Use after changing a code rule: it recomputes final_category, override_reasons, needs_review,
// review_reasons and details from each row's raw_output, in place, and stamps reapplied_at on every
// row it changed. Prompt or schema changes can't be handled this way: they need new model calls.
//
//   npm run reapply              update the rows for the active CLASSIFIER_MODEL + PROMPT_VERSION
//   npm run reapply -- --dry-run show what would change, write nothing
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { getDb } from "../src/db/client";
import { getActiveRun, replyToInput } from "../src/db/queries";
import { classifications, replies } from "../src/db/schema";
import { policyFromRaw } from "../src/lib/classifier/classify";
import { ModelOutput } from "../src/lib/classifier/schema";

const dryRun = process.argv.includes("--dry-run");
const run = getActiveRun();
const db = getDb();

const rows = await db
  .select({ c: classifications, reply: replies })
  .from(classifications)
  .innerJoin(replies, eq(replies.id, classifications.replyId))
  .where(
    and(
      eq(classifications.model, run.model),
      eq(classifications.promptVersion, run.promptVersion),
      isNull(classifications.error),
      isNotNull(classifications.rawOutput),
    ),
  )
  .orderBy(classifications.replyId, classifications.id);

console.log(`Model: ${run.model} | prompt version: ${run.promptVersion} | ${rows.length} stored answers${dryRun ? " (dry run)" : ""}`);

// Postgres jsonb doesn't keep key order, so compare with keys sorted.
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
let changed = 0;
let skipped = 0;

for (const { c, reply } of rows) {
  const raw = ModelOutput.safeParse(c.rawOutput);
  if (!raw.success) {
    skipped++;
    console.log(`#${c.replyId} (row ${c.id}): stored raw_output no longer matches the schema; skipped`);
    continue;
  }
  const p = policyFromRaw(raw.data, replyToInput(reply));

  const next = {
    finalCategory: p.finalCategory,
    overrideReasons: p.overrideReasons,
    needsReview: p.needsReview,
    reviewReasons: p.reviewReasons,
    details: p.details,
  };
  const diffs: string[] = [];
  if (c.finalCategory !== next.finalCategory) diffs.push(`final ${c.finalCategory} → ${next.finalCategory}`);
  if (!same(c.overrideReasons, next.overrideReasons)) diffs.push(`overrides [${c.overrideReasons}] → [${next.overrideReasons}]`);
  if (c.needsReview !== next.needsReview) diffs.push(`needs_review ${c.needsReview} → ${next.needsReview}`);
  if (!same(c.reviewReasons, next.reviewReasons)) diffs.push(`review reasons [${c.reviewReasons}] → [${next.reviewReasons}]`);
  if (!same(c.details, next.details)) diffs.push("details changed");
  if (diffs.length === 0) continue;

  changed++;
  console.log(`#${c.replyId} (row ${c.id}): ${diffs.join("; ")}`);
  if (!dryRun) {
    await db.update(classifications).set({ ...next, reappliedAt: new Date() }).where(eq(classifications.id, c.id));
  }
}

console.log(`${changed} row(s) ${dryRun ? "would change" : "updated"}, ${rows.length - changed - skipped} unchanged${skipped ? `, ${skipped} skipped` : ""}. No model calls were made.`);
