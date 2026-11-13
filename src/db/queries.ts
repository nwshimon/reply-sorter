import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "./client";
import type { ClassifyInput, ClassifyResult } from "../lib/classifier/classify";
import type { Category } from "../lib/categories";
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
      modelCategory: current.modelCategory,
      finalCategory: current.finalCategory,
      overrideReasons: current.overrideReasons,
      needsReview: current.needsReview,
      reviewReasons: current.reviewReasons,
      reasoning: current.reasoning,
      details: current.details,
      correctedTo: correction.toCategory,
      correctionNote: correction.note,
      shownCategory: sql<Category | null>`coalesce(${correction.toCategory}, ${current.finalCategory})`,
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

/** One reply with everything its detail page needs. */
export async function getReplyDetail(id: string, run: ActiveRun = getActiveRun()) {
  const db = getDb();
  const [reply] = await db.select().from(replies).where(eq(replies.id, id));
  if (!reply) return null;

  const current = currentResults(run);
  const [currentRow] = await db.select().from(current).where(eq(current.replyId, id));
  // The newest attempt of any kind, so a failed run can be shown (it is never the "current" result).
  const [lastAttempt] = await db
    .select()
    .from(classifications)
    .where(and(eq(classifications.replyId, id), eq(classifications.model, run.model), eq(classifications.promptVersion, run.promptVersion)))
    .orderBy(desc(classifications.id))
    .limit(1);
  const history = await db.select().from(corrections).where(eq(corrections.replyId, id)).orderBy(desc(corrections.id));

  const shownCategory: Category | null = history[0]?.toCategory ?? currentRow?.finalCategory ?? null;
  return { reply, current: currentRow ?? null, lastAttempt: lastAttempt ?? null, corrections: history, shownCategory };
}

export async function saveCorrection(input: { replyId: string; fromCategory: Category | null; toCategory: Category; note: string | null }) {
  await getDb().insert(corrections).values(input);
}

export async function insertPastedReply(r: typeof replies.$inferInsert) {
  await getDb().insert(replies).values(r);
}

/** How many real (non-pasted) replies are in the review queue: the dot beside Review in the sidebar. */
export async function countNeedsReview(run: ActiveRun = getActiveRun()): Promise<number> {
  const current = currentResults(run);
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(current)
    .innerJoin(replies, eq(replies.id, current.replyId))
    .where(and(eq(current.needsReview, true), ne(replies.source, "pasted")));
  return row.n;
}
