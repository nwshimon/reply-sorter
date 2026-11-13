// POLICY.md section 4 (and the tiers in section 5), applied to the model's output.
// Plain functions: no network, no database, no environment variables, so tests feed them
// hand-written model outputs. Every rule here can only make a result MORE cautious, never move
// a reply toward `paid`.
import { isValidRank, toV0, type Category } from "./categories";
import type { ModelDetails, ModelOutput } from "./classifier/schema";
import { checkPromisedDate, resolveDatePhrase } from "./dates";
import { amountInText, quoteInBody, sameAmount, sameInvoiceNumber } from "./evidence";

/** Why code changed the model's category or rank. */
export const OVERRIDE_REASONS = {
  manipulation_language: "Manipulation language (tier A): forced to needs human",
  invalid_rank: "Category and rank don't form a valid POLICY.md pair",
  paid_no_reference: "Paid claim without a confirmation, reference or trace number",
  paid_other_invoice: "Paid claim names a different invoice",
  paid_amount_mismatch: "Paid amount differs from the invoice amount",
  paid_amount_unverified: "Paid amount not found in the reply, so it can't be checked",
  status_update_not_strict: "Asks to mark paid without strict evidence (tier B)",
  classifier_error: "The classifier failed; never treated as a guess",
} as const;
export type OverrideReason = keyof typeof OVERRIDE_REASONS;

/** Why a reply is in the review queue (POLICY.md section 4, "Review queue"). */
export const REVIEW_REASONS = {
  needs_human: "Category is needs human",
  low_confidence: "Model confidence is not high",
  rule_override: "A code rule changed the model's answer",
  manipulation_language: "Manipulation language",
  status_update_request: "Asks us to update payment status",
  other_invoice_mentioned: "Mentions a different invoice number",
  partial_no_plan: "Partial payment with no plan for the rest",
  evidence_not_found: "Evidence quote isn't in the reply",
  amount_not_in_text: "An extracted amount isn't in the reply",
  promised_date_invalid: "Promised date is invalid or before the reply",
  promised_date_disagrees: "Code read the promised date differently",
  classifier_error: "Classifier error",
} as const;
export type ReviewReason = keyof typeof REVIEW_REASONS;

/** The reply facts the rules need. invoiceAmount may be a string: Postgres numeric. */
export type ReplyContext = {
  body: string;
  invoiceNumber: string;
  invoiceAmount: number | string;
  receivedAt: Date;
};

export type PolicyResult = {
  modelCategory: Category | null;
  modelRank: number | null;
  finalParent: Category;
  finalRank: number;
  finalCategory: Category;
  overrideReasons: OverrideReason[];
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  /** The model's details after code checks: discarded amounts and invalid dates are null. */
  details: ModelDetails | null;
};

export function applyPolicy(output: ModelOutput, reply: ReplyContext): PolicyResult {
  const overrides: OverrideReason[] = [];
  const review = new Set<ReviewReason>();
  const d: ModelDetails = { ...output.details };
  let parent: Category = output.category;
  let rank = output.rank;

  // Only record a rule as an override if it actually changed the answer: when the model already said
  // needs_human 0, tier A/B didn't "catch" anything, and logging it would inflate the rules' score.
  const toNeedsHuman = (reason: OverrideReason) => {
    if (parent === "needs_human" && rank === 0) return;
    overrides.push(reason);
    parent = "needs_human";
    rank = 0;
  };
  const toPaidRank = (r: 2 | 3, reason: OverrideReason) => {
    overrides.push(reason);
    rank = Math.max(rank, r); // paid 3 stays paid 3 even if a paid 2 reason also applies
  };

  // Rule 4.3: the evidence quote must be an exact substring of the body.
  if (!quoteInBody(output.evidence_quote, reply.body)) review.add("evidence_not_found");

  // Rule 4.2: every extracted amount must appear in the body; if not, it's discarded.
  let paidAmountDiscarded = false;
  if (d.amount_paid !== null && !amountInText(d.amount_paid, reply.body)) {
    d.amount_paid = null;
    paidAmountDiscarded = true;
    review.add("amount_not_in_text");
  }
  if (d.amount_disputed !== null && !amountInText(d.amount_disputed, reply.body)) {
    d.amount_disputed = null;
    review.add("amount_not_in_text");
  }

  // Promised date: must be a real date, not before the reply. Cross-checked against code's reading.
  const resolved = d.promised_date_text ? resolveDatePhrase(d.promised_date_text, reply.receivedAt) : null;
  if (d.promised_date !== null && !checkPromisedDate(d.promised_date, reply.receivedAt).ok) {
    d.promised_date = null;
    review.add("promised_date_invalid");
  }
  if (d.promised_date === null && resolved) {
    d.promised_date = resolved;
  } else if (d.promised_date !== null && resolved && resolved !== d.promised_date) {
    review.add("promised_date_disagrees");
  }

  const mentionsOtherInvoice =
    d.invoice_number_mentioned !== null &&
    d.invoice_number_mentioned.trim() !== "" &&
    !sameInvoiceNumber(d.invoice_number_mentioned, reply.invoiceNumber);

  // A category + rank pair outside POLICY.md can't be mapped, so it goes to a person.
  if (!isValidRank(parent, rank)) toNeedsHuman("invalid_rank");

  // The identifier POLICY.md section 3 asks for (paid 1 (b)): a confirmation, reference or trace number,
  // OR a forwarded remittance advice that lists THIS invoice. A remittance advice has no number of its own,
  // so code checks the facts around it: the reply says "remittance advice", the model named this invoice,
  // and a stated amount equals the invoice amount. Anything less still needs a reference.
  const hasReference = (d.payment_reference ?? "").trim() !== "";
  const remittanceListsThisInvoice =
    /remittance\s+advice/i.test(reply.body) &&
    d.invoice_number_mentioned !== null &&
    d.invoice_number_mentioned.trim() !== "" &&
    !mentionsOtherInvoice &&
    d.amount_paid !== null &&
    sameAmount(d.amount_paid, reply.invoiceAmount);
  const hasIdentifier = hasReference || remittanceListsThisInvoice;

  // Rule 4.1: recheck every paid 1 the model proposes.
  if (parent === "paid" && rank === 1) {
    if (!hasIdentifier) toPaidRank(2, "paid_no_reference");
    if (mentionsOtherInvoice) toPaidRank(3, "paid_other_invoice");
    if (d.amount_paid !== null && !sameAmount(d.amount_paid, reply.invoiceAmount)) {
      toPaidRank(3, "paid_amount_mismatch");
    }
    // The model read an amount we can't find: "no amount stated" would wrongly pass, so block paid.
    if (paidAmountDiscarded) toPaidRank(3, "paid_amount_unverified");
  }

  // Rule 4.5 / tier B: a request to update status needs strict evidence to stay paid:
  // identifier AND a stated amount equal to the invoice AND no other invoice named.
  if (output.flags.status_update_request) {
    const strict =
      parent === "paid" &&
      rank === 1 &&
      hasIdentifier &&
      d.amount_paid !== null &&
      sameAmount(d.amount_paid, reply.invoiceAmount) &&
      !mentionsOtherInvoice;
    if (!strict) toNeedsHuman("status_update_not_strict");
  }

  // Rule 4.4 / tier A: manipulation language always goes to a person, whatever else is in the reply.
  if (output.flags.manipulation_language) toNeedsHuman("manipulation_language");

  const finalCategory = toV0(parent, rank) ?? "needs_human";

  // Review queue (POLICY.md section 4).
  if (finalCategory === "needs_human") review.add("needs_human");
  if (output.confidence !== "high") review.add("low_confidence");
  if (overrides.length > 0) review.add("rule_override");
  if (output.flags.manipulation_language) review.add("manipulation_language");
  if (output.flags.status_update_request) review.add("status_update_request");
  if (mentionsOtherInvoice) review.add("other_invoice_mentioned");
  if (parent === "promise_to_pay" && rank === 2 && d.amount_paid !== null) review.add("partial_no_plan");

  const reviewReasons = [...review];
  return {
    modelCategory: output.category,
    modelRank: output.rank,
    finalParent: parent,
    finalRank: rank,
    finalCategory,
    overrideReasons: overrides,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    details: d,
  };
}

/** Rule 4.6: any failure (timeout, API error, invalid output) → needs_human, never a guess. */
export function failureResult(): PolicyResult {
  return {
    modelCategory: null,
    modelRank: null,
    finalParent: "needs_human",
    finalRank: 0,
    finalCategory: "needs_human",
    overrideReasons: ["classifier_error"],
    needsReview: true,
    reviewReasons: ["classifier_error", "needs_human"],
    details: null,
  };
}
