import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./client";
import type { ClassifyInput, ClassifyResult } from "../lib/classifier/classify";
import { isAutomatic, type Category } from "../lib/categories";
import { classifications, corrections, replies, type CorrectionAction, type NewClassification, type Reply } from "./schema";

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
      action: corrections.action,
      toCategory: corrections.toCategory,
      note: corrections.note,
      createdAt: corrections.createdAt,
    })
    .from(corrections)
    .orderBy(corrections.replyId, desc(corrections.id))
    .as("latest_correction");
}

// ---------------------------------------------------------------------------------------------------------------
// Status: where a reply stands. THE one function (POLICY.md section 5, CLAUDE.md "Database"); the list, the review
// queue, the detail page and the nav badge all use it.
//
//   Automatic  promise_to_pay, resend_invoice, out_of_office: nobody has to act.
//   In review  paid, dispute or needs_human, with no action yet that takes it out of the queue.
//   Resolved   confirmed, resolved offline, kept, or moved to paid by a person (which counts as confirmed).
//
// The shown category is the latest correction's to_category if there is one, else the system's final category.
// ---------------------------------------------------------------------------------------------------------------
export type ReplyStatus = "automatic" | "in_review" | "resolved";
export const STATUS_LABELS: Record<ReplyStatus, string> = { automatic: "Automatic", in_review: "In review", resolved: "Resolved" };

export type LatestAction = { action: CorrectionAction; toCategory: Category } | null;

/** Null when the reply has no result yet (nothing to say about it). */
export function replyStatus(shown: Category | null, latest: LatestAction): ReplyStatus | null {
  if (!shown) return null;
  if (latest) {
    switch (latest.action) {
      case "confirm_paid":
      case "resolve_offline":
      case "keep":
        return "resolved";
      case "reject_paid":
        return "in_review"; // back in Needs human, still open
      case "recategorize":
        if (latest.toCategory === "paid") return "resolved"; // a person saying "paid" counts as confirmed
        return isAutomatic(latest.toCategory) ? "automatic" : "in_review";
    }
  }
  return isAutomatic(shown) ? "automatic" : "in_review";
}

/** The three sections of the review queue. */
export type QueueSection = "needs_human" | "confirm_payment" | "dispute";
export function queueSection(shown: Category): QueueSection | null {
  if (shown === "needs_human") return "needs_human";
  if (shown === "paid") return "confirm_payment";
  if (shown === "dispute") return "dispute";
  return null;
}

/** "What happens next" for a reply, in plain words. */
export function nextStepText(shown: Category | null, status: ReplyStatus | null): string {
  if (!shown || !status) return "Not classified yet.";
  if (status === "automatic") return "Handled automatically. No one needs to act.";
  if (status === "resolved") return "Resolved. A person has dealt with it.";
  const section = queueSection(shown);
  if (section === "confirm_payment") return "Goes to the review queue: confirm payment.";
  if (section === "dispute") return "Goes to the review queue: settle offline.";
  return "Goes to the review queue: set the right category.";
}

/** Every reply with its current result and latest correction. The shown category is the correction if any. */
export async function listReplies(run: ActiveRun = getActiveRun()) {
  const current = currentResults(run);
  const correction = latestCorrections();
  const rows = await getDb()
    .select({
      reply: replies,
      modelCategory: current.modelCategory,
      finalCategory: current.finalCategory,
      overrideReasons: current.overrideReasons,
      needsReview: current.needsReview,
      reviewReasons: current.reviewReasons,
      reasoning: current.reasoning,
      evidenceQuote: current.evidenceQuote,
      confidence: current.confidence,
      details: current.details,
      correctedTo: correction.toCategory,
      correctionAction: correction.action,
      correctionNote: correction.note,
      shownCategory: sql<Category | null>`coalesce(${correction.toCategory}, ${current.finalCategory})`,
    })
    .from(replies)
    .leftJoin(current, eq(current.replyId, replies.id))
    .leftJoin(correction, eq(correction.replyId, replies.id))
    .orderBy(desc(replies.receivedAt), desc(replies.id));

  // A reply whose only attempts FAILED has no "current result" (that rule ignores errored rows, so the evaluation can't
  // be fooled by one). POLICY.md still says a failure goes to Needs human, so the UI shows it there, with the reason.
  const failedIds = rows.filter((r) => r.finalCategory === null).map((r) => r.reply.id);
  const failures = new Map<string, { error: string | null; reviewReasons: string[]; overrideReasons: string[] }>();
  if (failedIds.length > 0) {
    const failed = await getDb()
      .selectDistinctOn([classifications.replyId], {
        replyId: classifications.replyId,
        error: classifications.error,
        reviewReasons: classifications.reviewReasons,
        overrideReasons: classifications.overrideReasons,
      })
      .from(classifications)
      .where(and(sql`${classifications.error} is not null`, eq(classifications.model, run.model), eq(classifications.promptVersion, run.promptVersion)))
      .orderBy(classifications.replyId, desc(classifications.id));
    for (const f of failed) if (failedIds.includes(f.replyId)) failures.set(f.replyId, f);
  }

  return rows.map((r) => {
    const fail = failures.get(r.reply.id);
    const shown: Category | null = r.shownCategory ?? (fail ? "needs_human" : null);
    return {
      ...r,
      shownCategory: shown,
      classifierFailed: !!fail,
      overrideReasons: r.overrideReasons ?? fail?.overrideReasons ?? null,
      reviewReasons: r.reviewReasons ?? fail?.reviewReasons ?? null,
      status: replyStatus(shown, r.correctedTo && r.correctionAction ? { action: r.correctionAction, toCategory: r.correctedTo } : null),
    };
  });
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
    finalParent: r.policy.finalParent,
    finalRank: r.policy.finalRank,
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

  // Every classification run for this reply (any model or prompt version), for the history timeline.
  const runs = await db
    .select({
      id: classifications.id,
      model: classifications.model,
      promptVersion: classifications.promptVersion,
      finalCategory: classifications.finalCategory,
      error: classifications.error,
      createdAt: classifications.createdAt,
    })
    .from(classifications)
    .where(eq(classifications.replyId, id))
    .orderBy(desc(classifications.id));

  const latest = history[0] ?? null;
  // A reply whose only attempts failed goes to Needs human (POLICY.md); see listReplies.
  const failedOnly = !currentRow && !!lastAttempt?.error;
  const shownCategory: Category | null = latest?.toCategory ?? currentRow?.finalCategory ?? (failedOnly ? "needs_human" : null);
  const status = replyStatus(shownCategory, latest ? { action: latest.action, toCategory: latest.toCategory } : null);
  return { reply, current: currentRow ?? null, lastAttempt: lastAttempt ?? null, failedOnly, corrections: history, latestCorrection: latest, runs, shownCategory, status };
}

export async function saveCorrection(input: {
  replyId: string;
  action?: CorrectionAction;
  fromCategory: Category | null;
  toCategory: Category;
  note: string | null;
}) {
  await getDb().insert(corrections).values(input);
}

/** Returns false if a reply with this id already exists (a repeated submission), true if it was created. */
export async function insertPastedReply(r: typeof replies.$inferInsert): Promise<boolean> {
  const rows = await getDb().insert(replies).values(r).onConflictDoNothing().returning({ id: replies.id });
  return rows.length > 0;
}

/** How many replies are In review: the number beside Review in the nav. */
export async function countInReview(run: ActiveRun = getActiveRun()): Promise<number> {
  return (await listReplies(run)).filter((r) => r.status === "in_review").length;
}
