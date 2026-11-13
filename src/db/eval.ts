import { and, eq } from "drizzle-orm";
import heldoutLabels from "../../data/heldout-labels.json";
import datasetLabels from "../../data/labels.json";
import { CATEGORIES, displayedCategory, type Category } from "../lib/categories";
import { computeMetrics, type EvalRow, type Metrics } from "../lib/metrics";
import { getDb } from "./client";
import { currentResultRows, repliesBySource, type ActiveRun } from "./queries";
import { classifications, replies } from "./schema";

// The evaluation, built from stored results and MY labels (data/*labels.json). It never reads the
// corrections table: a correction made in a demo must not change precision or recall.
// Shared by scripts/eval.ts and the /eval page.

export type EvalSet = "dataset" | "heldout";

// data/labels.json (v1): `display_category` is what is scored; category + rank are the internal parent and rank.
type LabelRow = { id: string; display_category: string };
const LABEL_FILES: Record<EvalSet, LabelRow[]> = { dataset: datasetLabels, heldout: heldoutLabels };

export type EvalResult = {
  set: EvalSet;
  model: string;
  promptVersion: string;
  generatedAt: string;
  /** Everything spent on this model + prompt version for this set, including failed and retried calls. */
  tokens: { prompt: number; completion: number; total: number };
  metrics: Metrics;
};

export async function buildEval(run: ActiveRun, set: EvalSet = "dataset"): Promise<EvalResult> {
  const labels = new Map<string, Category>();
  for (const l of LABEL_FILES[set]) {
    if (!(CATEGORIES as readonly string[]).includes(l.display_category)) throw new Error(`Bad label for ${l.id}: ${l.display_category}`);
    labels.set(l.id, l.display_category as Category);
  }

  const setReplies = await repliesBySource(set);
  const bodies = new Map(setReplies.map((r) => [r.id, r.body]));
  const current = (await currentResultRows(run)).filter((r) => bodies.has(r.replyId));

  const rows: EvalRow[] = current.map((c) => {
    const label = labels.get(c.replyId);
    if (!label) throw new Error(`No label for reply ${c.replyId}`);
    return {
      id: c.replyId,
      body: bodies.get(c.replyId)!,
      label,
      // The model alone, before any code rule: its category + rank mapped through POLICY.md section 5 (an invalid pair counts as needs_human).
      model: c.modelCategory && c.modelRank !== null ? (displayedCategory(c.modelCategory, c.modelRank) ?? "needs_human") : "needs_human",
      final: c.finalCategory,
      needsReview: c.needsReview,
      reasoning: c.reasoning,
      overrideReasons: c.overrideReasons,
      reviewReasons: c.reviewReasons,
    };
  });

  // All rows for this run in this set: failed-only replies for coverage, and total tokens spent.
  const all = await getDb()
    .select({ replyId: classifications.replyId, error: classifications.error, p: classifications.promptTokens, c: classifications.completionTokens })
    .from(classifications)
    .innerJoin(replies, eq(replies.id, classifications.replyId))
    .where(and(eq(classifications.model, run.model), eq(classifications.promptVersion, run.promptVersion), eq(replies.source, set)));
  const scored = new Set(rows.map((r) => r.id));
  const failedOnly = new Set(all.filter((r) => r.error && !scored.has(r.replyId)).map((r) => r.replyId));
  const prompt = all.reduce((n, r) => n + (r.p ?? 0), 0);
  const completion = all.reduce((n, r) => n + (r.c ?? 0), 0);

  return {
    set,
    model: run.model,
    promptVersion: run.promptVersion,
    generatedAt: new Date().toISOString(),
    tokens: { prompt, completion, total: prompt + completion },
    metrics: computeMetrics(rows, labels.size, failedOnly.size),
  };
}

/** results-v1-gpt-oss-120b.json, or heldout-results-… for the held-out set. */
export function resultsFileName(r: Pick<EvalResult, "set" | "model" | "promptVersion">): string {
  const model = r.model.split("/").pop();
  return `${r.set === "heldout" ? "heldout-results" : "results"}-${r.promptVersion}-${model}.json`;
}
