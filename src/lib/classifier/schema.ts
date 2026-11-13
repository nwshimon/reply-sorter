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

// The same contract as a Groq strict-mode JSON Schema. Strict mode needs EVERY property listed in
// `required` and `additionalProperties: false` on every object; optional fields use a type array.
// No `format`, `pattern` or min/max: dates and amounts are validated in code. A test keeps this
// in step with the Zod schema above. Property order is the order the model fills them in:
// reasoning comes first so the model explains itself before choosing a category.
const nullable = (type: "string" | "number") => ({ type: [type, "null"] });

export const GROQ_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reasoning", "category", "rank", "confidence", "evidence_quote", "details", "flags"],
  properties: {
    reasoning: { type: "string" },
    category: { type: "string", enum: [...CATEGORIES] },
    rank: { type: "integer", enum: [0, 1, 2, 3] },
    confidence: { type: "string", enum: [...CONFIDENCES] },
    evidence_quote: { type: "string" },
    details: {
      type: "object",
      additionalProperties: false,
      required: [
        "amount_paid",
        "amount_disputed",
        "promised_date_text",
        "promised_date",
        "payment_reference",
        "invoice_number_mentioned",
      ],
      properties: {
        amount_paid: nullable("number"),
        amount_disputed: nullable("number"),
        promised_date_text: nullable("string"),
        promised_date: nullable("string"),
        payment_reference: nullable("string"),
        invoice_number_mentioned: nullable("string"),
      },
    },
    flags: {
      type: "object",
      additionalProperties: false,
      required: ["manipulation_language", "status_update_request"],
      properties: {
        manipulation_language: { type: "boolean" },
        status_update_request: { type: "boolean" },
      },
    },
  },
} as const;
export type ModelDetails = ModelOutput["details"];
