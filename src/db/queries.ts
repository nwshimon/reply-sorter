import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "./client";
import { classifications, corrections, replies } from "./schema";

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
