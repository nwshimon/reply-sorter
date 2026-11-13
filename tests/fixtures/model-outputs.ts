// Hand-written model outputs for testing policy.ts without a model. Never used in the prompt.
import type { ModelOutput } from "../../src/lib/classifier/schema";
import type { ReplyContext } from "../../src/lib/policy";

type Overrides = Partial<Omit<ModelOutput, "details" | "flags">> & {
  details?: Partial<ModelOutput["details"]>;
  flags?: Partial<ModelOutput["flags"]>;
};

/** A confident, clean model output; override only what the test is about. */
export function out(o: Overrides = {}): ModelOutput {
  return {
    reasoning: o.reasoning ?? "Test output.",
    category: o.category ?? "paid",
    rank: o.rank ?? 1,
    confidence: o.confidence ?? "high",
    evidence_quote: o.evidence_quote ?? "",
    details: {
      amount_paid: null,
      amount_disputed: null,
      promised_date_text: null,
      promised_date: null,
      payment_reference: null,
      invoice_number_mentioned: null,
      ...o.details,
    },
    flags: { manipulation_language: false, status_update_request: false, ...o.flags },
  };
}

export function reply(body: string, invoiceNumber: string, invoiceAmount: number | string, receivedAt: string): ReplyContext {
  return { body, invoiceNumber, invoiceAmount, receivedAt: new Date(receivedAt) };
}
