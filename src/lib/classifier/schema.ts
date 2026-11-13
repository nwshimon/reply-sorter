import { z } from "zod";
import { CATEGORIES, CONFIDENCES } from "../categories";

// The model's output contract (CLAUDE.md "Model output", v0, 12 fields).
// This Zod schema re-checks the model's JSON before anything is saved; anything that fails it
// becomes needs_human / classifier_error. The matching Groq JSON Schema is added in step 4.
// Formats (dates, amounts in the text, evidence) are checked in code, not here: see policy.ts.
export const ModelOutput = z.strictObject({
  reasoning: z.string(),
  category: z.enum(CATEGORIES),
  rank: z.int().min(0).max(3),
  confidence: z.enum(CONFIDENCES),
  evidence_quote: z.string(),
  details: z.strictObject({
    amount_paid: z.number().nullable(),
    amount_disputed: z.number().nullable(),
    promised_date_text: z.string().nullable(),
    promised_date: z.string().nullable(),
    payment_reference: z.string().nullable(),
    invoice_number_mentioned: z.string().nullable(),
  }),
  flags: z.strictObject({
    manipulation_language: z.boolean(),
    status_update_request: z.boolean(),
  }),
});
export type ModelOutput = z.infer<typeof ModelOutput>;
export type ModelDetails = ModelOutput["details"];
