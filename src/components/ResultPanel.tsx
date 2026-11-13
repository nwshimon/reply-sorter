import { CATEGORY_LABELS, type Category } from "@/lib/categories";
import type { ModelDetails } from "@/lib/classifier/schema";
import { dateTime, money } from "@/lib/format";
import type { Classification, Reply } from "@/db/schema";
import { CategoryPill } from "./CategoryPill";
import { OverrideList, ReviewReasonChips } from "./ReasonChips";

/** The reply body with the model's evidence quote highlighted, if the quote is really in it. */
export function HighlightedBody({ body, quote }: { body: string; quote: string | null }) {
  const q = (quote ?? "").trim();
  const at = q ? body.indexOf(q) : -1;
  return (
    <div>
      <p className="whitespace-pre-wrap break-words rounded-md bg-neutral-50 p-3 text-sm leading-relaxed dark:bg-neutral-900">
        {at < 0 ? (
          body
        ) : (
          <>
            {body.slice(0, at)}
            <mark className="rounded bg-yellow-200 px-0.5 text-neutral-900 dark:bg-yellow-500/40 dark:text-neutral-50">{q}</mark>
            {body.slice(at + q.length)}
          </>
        )}
      </p>
      {q && at < 0 && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">The model’s evidence quote isn’t in the reply, so nothing is highlighted.</p>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/**
 * The full result for one reply: category, the model's reasoning, highlighted evidence, extracted
 * details, the rules that changed the answer, and why it needs review. Used on the detail page and
 * under the paste box. `row` is null when the reply has no result yet.
 */
export function ResultPanel({
  reply,
  row,
  correctedTo,
}: {
  reply: Reply;
  row: Classification | null;
  correctedTo?: Category | null;
}) {
  const details = (row?.details ?? null) as ModelDetails | null;
  const modelSaid =
    row?.modelCategory != null ? `${CATEGORY_LABELS[row.modelCategory]} (rank ${row.modelRank})` : null;
  const shown: Category | null = correctedTo ?? row?.finalCategory ?? null;
  const rulesChanged = row && !row.error && row.overrideReasons.length > 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CategoryPill category={shown} edited={!!correctedTo} />
        {row && !row.error && (
          <span className="text-sm text-neutral-500">
            {correctedTo && row.finalCategory !== correctedTo ? `System said ${CATEGORY_LABELS[row.finalCategory]}. ` : ""}
            {modelSaid && `Model said ${modelSaid}`}
            {rulesChanged ? ` → rules changed it to ${CATEGORY_LABELS[row.finalCategory]}` : ""}
          </span>
        )}
      </div>

      {row?.error && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <p className="font-medium">The classifier failed, so this reply was sent to a person instead of being guessed.</p>
          <p className="mt-1 break-words font-mono text-xs">{row.error}</p>
        </div>
      )}

      {!row && <p className="text-sm text-neutral-500">This reply hasn’t been classified for the current model and prompt version.</p>}

      {row?.reasoning && (
        <div>
          <h3 className="text-xs uppercase tracking-wide text-neutral-500">Model’s reasoning</h3>
          <p className="mt-1 text-sm leading-relaxed">{row.reasoning}</p>
        </div>
      )}

      <div>
        <h3 className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Reply{row?.evidenceQuote ? " · evidence highlighted" : ""}</h3>
        <HighlightedBody body={reply.body} quote={row?.evidenceQuote ?? null} />
      </div>

      {details && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Detail label="Amount paid">{details.amount_paid !== null ? money(details.amount_paid, reply.currency) : "—"}</Detail>
          <Detail label="Amount disputed">{details.amount_disputed !== null ? money(details.amount_disputed, reply.currency) : "—"}</Detail>
          <Detail label="Promised date">
            {details.promised_date ?? "—"}
            {details.promised_date_text && <span className="block text-xs text-neutral-500">“{details.promised_date_text}”</span>}
          </Detail>
          <Detail label="Payment reference">{details.payment_reference ?? "—"}</Detail>
          <Detail label="Invoice mentioned">{details.invoice_number_mentioned ?? "—"}</Detail>
          <Detail label="Confidence">{row?.confidence ?? "—"}</Detail>
        </dl>
      )}

      {rulesChanged && (
        <div>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Rules that changed the answer</h3>
          <OverrideList reasons={row.overrideReasons} />
        </div>
      )}

      {row && row.reviewReasons.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Why it’s in the review queue</h3>
          <ReviewReasonChips reasons={row.reviewReasons} />
        </div>
      )}

      {row && (
        <p className="text-xs text-neutral-500">
          {row.model} · prompt {row.promptVersion}
          {row.latencyMs != null && ` · ${row.latencyMs} ms`}
          {row.promptTokens != null && ` · ${row.promptTokens + (row.completionTokens ?? 0)} tokens`} · {dateTime(row.createdAt)}
        </p>
      )}
    </section>
  );
}
