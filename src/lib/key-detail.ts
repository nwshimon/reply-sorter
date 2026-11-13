// The "key detail" column of the Replies table, by category. Pure function.
import type { Category } from "./categories";
import type { ModelDetails } from "./classifier/schema";
import { calendarDate, money } from "./format";

export type KeyDetail = { primary: string; muted?: string };

/**
 *   paid            reference, plus amount if given
 *   promise_to_pay  the promised date as a date, and the phrase as written in muted text
 *   dispute         amount disputed if given
 *   needs_human     the first reason chip (passed in)
 *   others          nothing
 */
export function keyDetail(shown: Category | null, d: ModelDetails | null, currency: string, firstChip: string | null): KeyDetail | null {
  switch (shown) {
    case "paid": {
      const parts: string[] = [];
      if (d?.payment_reference) parts.push(`Ref ${d.payment_reference}`);
      if (d?.amount_paid != null) parts.push(money(d.amount_paid, currency));
      return { primary: parts.length ? parts.join(" · ") : "No reference given" };
    }
    case "promise_to_pay":
      if (d?.promised_date) return { primary: calendarDate(d.promised_date), muted: d.promised_date_text ? `“${d.promised_date_text}”` : undefined };
      return { primary: "No date given", muted: d?.promised_date_text ? `“${d.promised_date_text}”` : undefined };
    case "dispute":
      return d?.amount_disputed != null ? { primary: `${money(d.amount_disputed, currency)} disputed` } : null;
    case "needs_human":
      return firstChip ? { primary: firstChip } : null;
    default:
      return null;
  }
}
