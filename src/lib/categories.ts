// The category list, defined once. Used by the UI, the model schema, the database enum and eval.
// POLICY.md uses the same six names for parent categories and for v0 categories.
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
