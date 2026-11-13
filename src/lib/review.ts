// Review-queue ordering and the plain-text "concerns" shown beside each queued reply.
// Pure functions: no database, no env.
//
// Four risk tiers, then oldest received first inside a tier (the oldest unpaid money is the most
// urgent). Which tier a reply is in depends only on WHY it was flagged, so it's explainable on screen.

import type { Category } from "./categories";
import { OVERRIDE_REASONS, REVIEW_REASONS } from "./policy";

export const QUEUE_TIERS = [
  {
    tier: 1,
    title: "Check first",
    hint: "A paid claim the code blocked, manipulation language, a request to change payment status, or a classifier error.",
  },
  { tier: 2, title: "Needs a decision", hint: "The reply needs a person: unclear, legal, a call request, or another case the policy sends to a human." },
  { tier: 3, title: "Check the money", hint: "A partial payment, another invoice mentioned, or an amount the reply doesn't contain." },
  { tier: 4, title: "Low confidence", hint: "The model wasn't sure, or its evidence or promised date didn't check out." },
] as const;
export type QueueTier = (typeof QUEUE_TIERS)[number]["tier"];

export type QueueInput = {
  reviewReasons: readonly string[];
  overrideReasons: readonly string[];
};

const TIER_1_REASONS = new Set(["classifier_error", "manipulation_language", "status_update_request"]);
const TIER_3_REASONS = new Set(["partial_no_plan", "other_invoice_mentioned", "amount_not_in_text"]);

/** The first tier that matches wins. */
export function queueTier(r: QueueInput): QueueTier {
  // A paid claim that code downgraded (paid_no_reference, paid_amount_mismatch, …): the costliest mistake to miss.
  const blockedPaid = r.overrideReasons.some((o) => o.startsWith("paid_"));
  if (blockedPaid || r.reviewReasons.some((x) => TIER_1_REASONS.has(x))) return 1;
  if (r.reviewReasons.includes("needs_human")) return 2;
  if (r.reviewReasons.some((x) => TIER_3_REASONS.has(x))) return 3;
  return 4;
}

/** Tier first, then oldest received, then id so the order never flickers. */
export function sortQueue<T extends QueueInput & { id: string; receivedAt: Date }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      queueTier(a) - queueTier(b) ||
      a.receivedAt.getTime() - b.receivedAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

export type ConcernsInput = {
  reviewReasons: readonly string[];
  overrideReasons: readonly string[];
  reasoning: string | null;
  finalCategory: Category | null;
};

/** The first sentence of the model's reasoning, for a reply with no specific concern. */
const firstSentence = (text: string) => (text.trim().match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text.trim()).trim();

// Review reasons that only repeat something said elsewhere, so they're left out of the plain-text line:
// "needs_human" is the category itself, "rule_override" is replaced by the override's own explanation.
const REDUNDANT = new Set(["needs_human", "rule_override"]);

/**
 * Plain-text reasons a reply is in the queue, most specific first. Rules that changed the answer are
 * named by what they found. A needs-human reply that no rule touched (the model itself sent it to a
 * person) leads with the first sentence of the model's reasoning, since that IS the reason. Then the
 * other flags, without repeating anything.
 */
export function describeConcerns(r: ConcernsInput): string[] {
  const out: string[] = [];
  const overrides = new Set(r.overrideReasons);
  for (const key of r.overrideReasons) out.push(OVERRIDE_REASONS[key as keyof typeof OVERRIDE_REASONS] ?? key);
  if (r.finalCategory === "needs_human" && r.overrideReasons.length === 0 && r.reasoning) out.push(firstSentence(r.reasoning));
  for (const key of r.reviewReasons) {
    if (REDUNDANT.has(key) || overrides.has(key)) continue;
    out.push(REVIEW_REASONS[key as keyof typeof REVIEW_REASONS] ?? key);
  }
  if (out.length === 0) out.push("Flagged for review");
  return out;
}
