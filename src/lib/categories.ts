// The category and rank list, defined once. Used by the UI, the model schema, the database enum,
// policy.ts and eval. POLICY.md uses the same six names for parent categories and displayed categories.
export const CATEGORIES = [
  "paid",
  "promise_to_pay",
  "dispute",
  "resend_invoice",
  "out_of_office",
  "needs_human",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const isCategory = (x: unknown): x is Category => typeof x === "string" && (CATEGORIES as readonly string[]).includes(x);

export const CONFIDENCES = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/**
 * POLICY.md section 5: the fixed lookup from (parent category, rank) to the DISPLAYED category.
 * Parent and rank are internal; the interface and the evaluation only ever use the displayed category.
 * A pair not in this table is invalid; policy.ts sends it to needs_human.
 * (The promise-horizon rule can also display needs_human for a promise_to_pay 1 or 2: that is applied
 * on top of this table in policy.ts and never changes the parent or rank.)
 */
export const DISPLAY_MAPPING: Record<Category, Partial<Record<number, Category>>> = {
  paid: { 1: "paid", 2: "needs_human", 3: "needs_human" },
  promise_to_pay: { 1: "promise_to_pay", 2: "promise_to_pay", 3: "dispute" },
  resend_invoice: { 1: "resend_invoice", 2: "needs_human", 3: "dispute" },
  dispute: { 0: "dispute" },
  out_of_office: { 0: "out_of_office" },
  needs_human: { 0: "needs_human" },
};

/** The displayed category for a parent + rank, or null if the pair isn't in POLICY.md. */
export function displayedCategory(parent: Category, rank: number): Category | null {
  return DISPLAY_MAPPING[parent][rank] ?? null;
}

export function isValidRank(parent: Category, rank: number): boolean {
  return displayedCategory(parent, rank) !== null;
}

/**
 * POLICY.md section 5: these are handled by the system with no person involved, so they never enter the
 * review queue. Everything else (paid, dispute, needs_human) waits in the queue for a person.
 */
export const AUTOMATIC_CATEGORIES: readonly Category[] = ["promise_to_pay", "resend_invoice", "out_of_office"];
export const isAutomatic = (c: Category): boolean => AUTOMATIC_CATEGORIES.includes(c);

/** Display labels. "paid" is a credible claim, not verified payment (no bank data). */
export const CATEGORY_LABELS: Record<Category, string> = {
  paid: "Paid (claimed)",
  promise_to_pay: "Promise to pay",
  dispute: "Dispute",
  resend_invoice: "Resend invoice",
  out_of_office: "Out of office",
  needs_human: "Needs human",
};
