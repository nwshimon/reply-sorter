import type { ModelDetails } from "@/lib/classifier/schema";
import { daysUntil } from "@/lib/dates";
import { calendarDate, money } from "@/lib/format";
import { ruleSentence } from "@/lib/reasons";
import type { Category } from "@/lib/categories";

const NONE = <span className="text-neutral-400">Not mentioned</span>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/** "What we found": the details taken from the reply. Empty values say "Not mentioned". */
export function FoundList({ details, currency, receivedAt }: { details: ModelDetails | null; currency: string; receivedAt: Date }) {
  const d = details;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
      <Row label="Amount paid">{d?.amount_paid != null ? money(d.amount_paid, currency) : NONE}</Row>
      <Row label="Amount disputed">{d?.amount_disputed != null ? money(d.amount_disputed, currency) : NONE}</Row>
      <Row label="Promised date">
        {d?.promised_date ? (
          <>
            {calendarDate(d.promised_date)}
            <span className="block text-xs text-neutral-500">
              {d.promised_date_text && <>“{d.promised_date_text}” · </>}
              {daysUntil(d.promised_date, receivedAt)} days after the reply
            </span>
          </>
        ) : d?.promised_date_text ? (
          <span className="text-neutral-500">“{d.promised_date_text}” (no usable date)</span>
        ) : (
          NONE
        )}
      </Row>
      <Row label="Payment reference">{d?.payment_reference ?? NONE}</Row>
      <Row label="Invoice mentioned">{d?.invoice_number_mentioned ?? NONE}</Row>
    </dl>
  );
}

/** "Rules applied": one readable sentence per rule that fired, or a plain "no rules" line. */
export function RulesApplied({ overrides, modelCategory, final }: { overrides: readonly string[]; modelCategory: Category | null; final: Category }) {
  if (overrides.length === 0) return <p className="text-sm text-neutral-600">No rules changed the model’s answer.</p>;
  return (
    <ul className="space-y-1.5 text-sm text-neutral-700">
      {overrides.map((code) => (
        <li key={code} className="flex gap-2">
          <span aria-hidden className="text-neutral-400">↳</span>
          {ruleSentence(code, modelCategory, final)}
        </li>
      ))}
    </ul>
  );
}
