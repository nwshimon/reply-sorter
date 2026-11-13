import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./client";
import type { ClassifyInput, ClassifyResult } from "../lib/classifier/classify";
import { classifications, corrections, replies, type NewClassification, type Reply } from "./schema";

/** Which classifier run is "active": results from other models or prompt versions are ignored. */
export type ActiveRun = { model: string; promptVersion: string };

export function getActiveRun(): ActiveRun {
  const model = process.env.CLASSIFIER_MODEL;
  const promptVersion = process.env.PROMPT_VERSION;
  if (!model || !promptVersion) throw new Error("CLASSIFIER_MODEL and PROMPT_VERSION must be set");
  return { model, promptVersion };
}

/**
 * THE definition of a reply's current result, used by the list, review queue, detail page and eval:
 * the row with the highest id among successful rows (error IS NULL) for the active model + prompt version.
 */
export function currentResults(run: ActiveRun) {
  return getDb()
    .selectDistinctOn([classifications.replyId])
    .from(classifications)
    .where(
      and(
        isNull(classifications.error),
        eq(classifications.model, run.model),
        eq(classifications.promptVersion, run.promptVersion),
      ),
    )
    .orderBy(classifications.replyId, desc(classifications.id))
    .as("current");
}

/** A reply's latest correction (highest id). Shown in the app; never used by the evaluation. */
function latestCorrections() {
  return getDb()
    .selectDistinctOn([corrections.replyId], {
      replyId: corrections.replyId,
      toCategory: corrections.toCategory,
      note: corrections.note,
      createdAt: corrections.createdAt,
    })
    .from(corrections)
    .orderBy(corrections.replyId, desc(corrections.id))
    .as("latest_correction");
}

/** Every reply with its current result and latest correction. The shown category is the correction if any. */
export async function listReplies(run: ActiveRun = getActiveRun()) {
  const current = currentResults(run);
  const correction = latestCorrections();
  return getDb()
    .select({
      reply: replies,
      finalCategory: current.finalCategory,
      needsReview: current.needsReview,
      reviewReasons: current.reviewReasons,
      details: current.details,
      correctedTo: correction.toCategory,
      shownCategory: sql<string | null>`coalesce(${correction.toCategory}, ${current.finalCategory})`,
    })
    .from(replies)
    .leftJoin(current, eq(current.replyId, replies.id))
    .leftJoin(correction, eq(correction.replyId, replies.id))
    .orderBy(asc(replies.source), asc(replies.id));
}

export type ReplyListRow = Awaited<ReturnType<typeof listReplies>>[number];

/** A stored reply as the classifier's input. */
export function replyToInput(r: Reply): ClassifyInput {
  return {
    body: r.body,
    invoiceNumber: r.invoiceNumber,
    invoiceAmount: r.invoiceAmount,
    currency: r.currency,
    dueDate: r.dueDate,
    receivedAt: r.receivedAt,
  };
}

/**
 * One classifications row from a classify() result. `raw_output` is the model's validated JSON before
 * code touched it, so reapply-policy.ts can recompute everything else from it with no model call.
 */
export function toClassificationRow(replyId: string, r: ClassifyResult): NewClassification {
  return {
    replyId,
    model: r.model,
    promptVersion: r.promptVersion,
    modelCategory: r.policy.modelCategory,
    modelRank: r.policy.modelRank,
    finalCategory: r.policy.finalCategory,
    overrideReasons: r.policy.overrideReasons,
    confidence: r.rawOutput?.confidence ?? null,
    reasoning: r.rawOutput?.reasoning ?? null,
    evidenceQuote: r.rawOutput?.evidence_quote ?? null,
    details: r.policy.details,
    flags: r.rawOutput?.flags ?? null,
    rawOutput: r.rawOutput,
    needsReview: r.policy.needsReview,
    reviewReasons: r.policy.reviewReasons,
    error: r.error,
    latencyMs: r.latencyMs,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
  };
}

export async function saveClassification(replyId: string, r: ClassifyResult) {
  const [row] = await getDb().insert(classifications).values(toClassificationRow(replyId, r)).returning({ id: classifications.id });
  return row.id;
}

/** Ids of replies that already have a current (successful) result for this run. Failed rows don't count. */
export async function doneReplyIds(run: ActiveRun): Promise<Set<string>> {
  const current = currentResults(run);
  const rows = await getDb().select({ id: current.replyId }).from(current);
  return new Set(rows.map((r) => r.id));
}

export async function repliesBySource(source: Reply["source"]): Promise<Reply[]> {
  return getDb().select().from(replies).where(eq(replies.source, source)).orderBy(asc(replies.id));
}

/** Every current result for a run, keyed by reply id. */
export async function currentResultRows(run: ActiveRun) {
  const current = currentResults(run);
  return getDb().select().from(current);
}
