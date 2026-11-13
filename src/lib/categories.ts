// The category and rank list, defined once. Used by the UI, the model schema, the database enum,
// policy.ts and eval. POLICY.md uses the same six names for parent categories and v0 categories.
export const CATEGORIES = [
  "paid",
  "promise_to_pay",
  "dispute",
  "resend_invoice",
  "out_of_office",
  "needs_human",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/**
 * POLICY.md section 3: the fixed lookup from (parent category, rank) to the v0 category.
 * A pair not in this table is invalid; policy.ts sends it to needs_human.
 */
export const V0_MAPPING: Record<Category, Partial<Record<number, Category>>> = {
  paid: { 1: "paid", 2: "needs_human", 3: "needs_human" },
  promise_to_pay: { 1: "promise_to_pay", 2: "promise_to_pay", 3: "dispute" },
  resend_invoice: { 1: "resend_invoice", 2: "needs_human", 3: "dispute" },
  dispute: { 0: "dispute" },
  out_of_office: { 0: "out_of_office" },
  needs_human: { 0: "needs_human" },
};

/** The v0 category for a parent + rank, or null if the pair isn't in POLICY.md. */
export function toV0(parent: Category, rank: number): Category | null {
  return V0_MAPPING[parent][rank] ?? null;
}

export function isValidRank(parent: Category, rank: number): boolean {
  return toV0(parent, rank) !== null;
}

/** Display labels. "paid" is a credible claim, not verified payment (no bank data). */
export const CATEGORY_LABELS: Record<Category, string> = {
  paid: "Paid (claimed)",
  promise_to_pay: "Promise to pay",
  dispute: "Dispute",
  resend_invoice: "Resend invoice",
  out_of_office: "Out of office",
  needs_human: "Needs human",
};
