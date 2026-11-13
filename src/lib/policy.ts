// POLICY.md v1 sections 4 (the rules, in order) and 5 (parent + rank → displayed category), applied to
// the model's output. Plain functions: no network, no database, no environment variables, so tests feed
// them hand-written model outputs. Every rule here can only send a reply toward a person, never toward
// `paid`.
import { displayedCategory, isAutomatic, isValidRank, type Category } from "./categories";
import type { ModelDetails, ModelOutput } from "./classifier/schema";
import { checkPromisedDate, daysUntil, PROMISE_HORIZON_DAYS } from "./dates";
import { amountInText, quoteInBody, sameAmount, sameInvoiceNumber } from "./evidence";

/** Why code changed the model's category or rank, or the displayed category. */
export const OVERRIDE_REASONS = {
  classifier_error: "The classifier failed; never treated as a guess",
  manipulation_language: "Manipulation language (tier A): forced to needs human",
  status_update_not_strict: "Asks to mark paid without strict evidence (tier B)",
  invalid_rank: "Category and rank don’t form a valid POLICY.md pair",
  paid_no_reference: "Paid claim without a confirmation, reference or trace number",
  paid_other_invoice: "Paid claim names a different invoice",
  paid_amount_mismatch: "Paid amount differs from the invoice amount",
  low_confidence_demotion: "Low confidence: moved down one rank",
  promise_over_30_days: "Promise more than 30 days out",
} as const;
export type OverrideReason = keyof typeof OVERRIDE_REASONS;

/** Why a reply is where it is: the plain-text "concerns" beside a queued reply. */
export const REVIEW_REASONS = {
  needs_human: "Needs a person’s decision",
  confirm_payment: "Payment claimed: confirm the money arrived",
  settle_offline: "To be settled offline",
  rule_override: "A code rule changed the model’s answer",
  low_confidence: "Model confidence is low",
  manipulation_language: "Manipulation language",
  status_update_request: "Asks us to update payment status",
  other_invoice_mentioned: "Mentions a different invoice number",
  evidence_not_found: "Evidence quote isn’t in the reply",
  amount_not_in_text: "An extracted amount isn’t in the reply",
  promise_over_30_days: "Promise more than 30 days out",
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
  /** What the model said, untouched. Null when the call failed. */
  modelCategory: Category | null;
  modelRank: number | null;
  /** Parent + rank after the rules: internal, never shown. */
  finalParent: Category;
  finalRank: number;
  /** The DISPLAYED category. Usually displayedCategory(finalParent, finalRank); the promise horizon overrides it. */
  finalCategory: Category;
  overrideReasons: OverrideReason[];
  /** True when a person has to act: the displayed category is paid, dispute or needs_human. */
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

  // Send to a person. A rule that changes nothing (the model already said needs_human 0) isn't recorded,
  // so the rules' score isn't inflated.
  const toHuman = (reason: OverrideReason) => {
    if (parent === "needs_human" && rank === 0) return;
    overrides.push(reason);
    parent = "needs_human";
    rank = 0;
  };

  // Facts from what the model extracted, before any discarding below.
  const hasReference = (d.payment_reference ?? "").trim() !== "";
  const mentionsOtherInvoice =
    d.invoice_number_mentioned !== null &&
    d.invoice_number_mentioned.trim() !== "" &&
    !sameInvoiceNumber(d.invoice_number_mentioned, reply.invoiceNumber);
  // POLICY.md paid 1 (b): a reference number, OR a forwarded remittance advice listing THIS invoice. An advice has
  // no number of its own, so code checks the facts around it: the reply says "remittance advice", the model named
  // this invoice, and a stated amount equals the invoice amount. Anything less still needs a reference.
  const remittanceListsThisInvoice =
    /remittance\s+advice/i.test(reply.body) &&
    d.invoice_number_mentioned !== null &&
    d.invoice_number_mentioned.trim() !== "" &&
    !mentionsOtherInvoice &&
    d.amount_paid !== null &&
    sameAmount(d.amount_paid, reply.invoiceAmount);
  const hasIdentifier = hasReference || remittanceListsThisInvoice;

  // (Rule 1, a failed call, is failureResult() below.) A pair outside POLICY.md can't be mapped, so it goes to a person.
  if (!isValidRank(parent, rank)) toHuman("invalid_rank");

  // Rule 2: manipulation language always goes to a person, even with payment evidence (tier A). A request to
  // update status must meet the strict paid evidence: an identifier, a stated amount equal to the invoice, and no
  // other invoice named (tier B). Otherwise it goes to a person.
  if (output.flags.manipulation_language) toHuman("manipulation_language");
  if (output.flags.status_update_request) {
    const strict =
      parent === "paid" &&
      rank === 1 &&
      hasIdentifier &&
      d.amount_paid !== null &&
      sameAmount(d.amount_paid, reply.invoiceAmount) &&
      !mentionsOtherInvoice;
    if (!strict) toHuman("status_update_not_strict");
  }

  // Rule 3: recheck every paid 1 the model proposes. No identifier → paid 2. Another invoice, or a different
  // amount → paid 3. All of these display as needs_human.
  if (parent === "paid" && rank === 1) {
    const lower = (to: 2 | 3, reason: OverrideReason) => {
      overrides.push(reason);
      rank = Math.max(rank, to);
    };
    if (!hasIdentifier) lower(2, "paid_no_reference");
    if (mentionsOtherInvoice) lower(3, "paid_other_invoice");
    if (d.amount_paid !== null && !sameAmount(d.amount_paid, reply.invoiceAmount)) lower(3, "paid_amount_mismatch");
  }

  // Rule 4: every extracted amount must appear in the body, and the evidence quote must be an exact substring.
  // A failure discards the value and counts as low confidence (rule 5).
  let evidenceFailed = false;
  if (!quoteInBody(output.evidence_quote, reply.body)) {
    evidenceFailed = true;
    review.add("evidence_not_found");
  }
  if (d.amount_paid !== null && !amountInText(d.amount_paid, reply.body)) {
    d.amount_paid = null;
    evidenceFailed = true;
    review.add("amount_not_in_text");
  }
  if (d.amount_disputed !== null && !amountInText(d.amount_disputed, reply.body)) {
    d.amount_disputed = null;
    evidenceFailed = true;
    review.add("amount_not_in_text");
  }

  // Rule 5: low confidence (the model said so, or rule 4 failed) demotes one rank: 1 → 2, 2 → 3. If that is
  // still an automatic category it stays automatic; if it would be dispute, or the rank is 0 or 3, it becomes
  // needs_human 0, so an uncertain reply never lands in dispute. paid 1 → paid 2 and resend_invoice 1 →
  // resend_invoice 2 keep their new rank (both display as needs_human).
  if (output.confidence === "low") review.add("low_confidence");
  if (output.confidence === "low" || evidenceFailed) {
    if (parent === "needs_human") {
      // already as cautious as it gets
    } else if (rank === 0 || rank === 3) {
      toHuman("low_confidence_demotion");
    } else {
      const next = rank + 1;
      const shown = displayedCategory(parent, next);
      if (shown !== null && shown !== "dispute") {
        overrides.push("low_confidence_demotion");
        rank = next;
      } else {
        toHuman("low_confidence_demotion");
      }
    }
  }

  // Rule 6: a promise more than 30 days after the reply is the customer setting its own terms. It DISPLAYS as
  // needs_human; parent and rank stay as they are. A promise with no date, or a date code can't validate,
  // stays automatic.
  if (d.promised_date !== null && !checkPromisedDate(d.promised_date, reply.receivedAt).ok) d.promised_date = null;
  let horizon = false;
  if (
    parent === "promise_to_pay" &&
    (rank === 1 || rank === 2) &&
    d.promised_date !== null &&
    daysUntil(d.promised_date, reply.receivedAt) > PROMISE_HORIZON_DAYS
  ) {
    horizon = true;
    overrides.push("promise_over_30_days");
    review.add("promise_over_30_days");
  }

  // POLICY.md section 5: the displayed category, and whether it waits for a person.
  const displayed: Category = horizon ? "needs_human" : (displayedCategory(parent, rank) ?? "needs_human");

  if (output.flags.manipulation_language) review.add("manipulation_language");
  if (output.flags.status_update_request) review.add("status_update_request");
  if (mentionsOtherInvoice) review.add("other_invoice_mentioned");
  if (overrides.length > 0) review.add("rule_override");
  if (displayed === "paid") review.add("confirm_payment");
  if (displayed === "dispute") review.add("settle_offline");
  if (displayed === "needs_human") review.add("needs_human");

  return {
    modelCategory: output.category,
    modelRank: output.rank,
    finalParent: parent,
    finalRank: rank,
    finalCategory: displayed,
    overrideReasons: overrides,
    needsReview: !isAutomatic(displayed),
    reviewReasons: [...review],
    details: d,
  };
}

/** Rule 1: any failure (timeout, API error, invalid output, a failed retry) → needs_human 0, never a guess. */
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
