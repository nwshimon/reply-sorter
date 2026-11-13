// Reason codes → readable text, in ONE place. Covers every override_reasons / review_reasons code the policy can
// produce (a test enforces it). `chip: false` codes only repeat what the section or category already says, so they
// aren't shown as a chip. An unknown code is shown as it is.
import { CATEGORY_LABELS, type Category } from "./categories";

export type ReasonDef = { text: string; chip: boolean };

export const REASONS: Record<string, ReasonDef> = {
  // Rules that changed the model's answer (override_reasons)
  classifier_error: { text: "Classifier error", chip: true },
  manipulation_language: { text: "Possible manipulation attempt", chip: true },
  status_update_not_strict: { text: "Asked to mark paid without enough proof", chip: true },
  invalid_rank: { text: "Unusable model answer", chip: true },
  paid_no_reference: { text: "No payment reference", chip: true },
  paid_other_invoice: { text: "Invoice number differs", chip: true },
  paid_amount_mismatch: { text: "Amount differs from invoice", chip: true },
  low_confidence_demotion: { text: "Low confidence", chip: true },
  promise_over_30_days: { text: "Promise more than 30 days out", chip: true },
  // Why a reply is where it is (review_reasons)
  low_confidence: { text: "Low confidence", chip: true },
  other_invoice_mentioned: { text: "Invoice number differs", chip: true },
  evidence_not_found: { text: "Evidence not found in reply", chip: true },
  amount_not_in_text: { text: "Amount not found in reply", chip: true },
  status_update_request: { text: "Asks to update payment status", chip: true },
  needs_human: { text: "Needs a person’s judgment", chip: false }, // category fallback, see reasonChips
  confirm_payment: { text: "Payment claimed: confirm it arrived", chip: false },
  settle_offline: { text: "To be settled offline", chip: false },
  rule_override: { text: "A rule changed the model’s answer", chip: false },
  // Not a policy code: added when a person pressed "✗ Not found" on a paid reply
  payment_not_found: { text: "Payment not found", chip: true },
};

export const reasonText = (code: string): string => REASONS[code]?.text ?? code;

/**
 * The chips for a reply: "Payment not found" first if a person rejected the payment, then the rules that fired, then
 * the other flags, each text once. A needs-human reply with nothing specific gets one generic chip so it never looks
 * unexplained.
 */
export function reasonChips(input: {
  overrideReasons: readonly string[];
  reviewReasons: readonly string[];
  latestAction?: string | null;
  shown: Category | null;
}): string[] {
  const out: string[] = [];
  const add = (code: string) => {
    const def = REASONS[code];
    const text = def ? (def.chip ? def.text : null) : code; // unknown codes show as-is
    if (text && !out.includes(text)) out.push(text);
  };
  if (input.latestAction === "reject_paid") add("payment_not_found");
  for (const c of input.overrideReasons) add(c);
  for (const c of input.reviewReasons) add(c);
  if (out.length === 0 && input.shown === "needs_human") out.push(REASONS.needs_human.text);
  return out;
}

/**
 * One sentence per rule that fired, for the detail page's "Rules applied". Never mentions ranks: the interface only
 * knows displayed categories.
 */
export function ruleSentence(code: string, modelCategory: Category | null, final: Category): string {
  const said = modelCategory ? `Model said ${CATEGORY_LABELS[modelCategory]}; ` : "";
  const moved = `moved to ${CATEGORY_LABELS[final]}.`;
  switch (code) {
    case "promise_over_30_days":
      return `Promise more than 30 days out: ${moved}`;
    case "paid_amount_mismatch":
      return `${said}the amount differs from the invoice: ${moved}`;
    case "paid_other_invoice":
      return `${said}the reply names a different invoice: ${moved}`;
    case "paid_no_reference":
      return `${said}there is no payment reference: ${moved}`;
    case "manipulation_language":
      return `The reply tries to give the system instructions: ${moved}`;
    case "status_update_not_strict":
      return `The reply asks us to mark it paid without enough proof: ${moved}`;
    case "low_confidence_demotion":
      return `The model wasn’t sure (or its quote or amount couldn’t be found in the reply), so its answer was made more cautious: ${moved}`;
    case "invalid_rank":
      return `The model’s answer wasn’t usable: ${moved}`;
    case "classifier_error":
      return `The classifier failed: ${moved}`;
    default:
      return reasonText(code);
  }
}
