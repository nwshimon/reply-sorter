import { reviewAction } from "@/app/actions";
import type { ReplyStatus } from "@/db/queries";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import { SubmitButton } from "./SubmitButton";

const select = "min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/**
 * Everything you can do with a reply, in ONE dropdown. The choices that apply to its current state come first
 * (POLICY.md section 5): ✓ / ✗ for a paid claim, "Resolved offline" for a dispute. Changing the category is always
 * available. The value is "<action>" or "recategorize:<category>"; the server re-checks it against the reply's state.
 */
export function ActionForm({ replyId, shown, status, returnTo }: { replyId: string; shown: Category; status: ReplyStatus | null; returnTo: string }) {
  const inReview = status === "in_review";
  return (
    <form action={reviewAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="replyId" value={replyId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label htmlFor={`choice-${replyId}`} className="sr-only">
        Action
      </label>
      <select id={`choice-${replyId}`} name="choice" required defaultValue="" className={select}>
        <option value="" disabled>
          Choose an action…
        </option>
        {inReview && shown === "paid" && (
          <optgroup label="Payment claim">
            <option value="confirm_paid">✓ Payment confirmed</option>
            <option value="reject_paid">✗ Payment not found</option>
          </optgroup>
        )}
        {inReview && shown === "dispute" && (
          <optgroup label="Dispute">
            <option value="resolve_offline">Resolved offline</option>
          </optgroup>
        )}
        <optgroup label="Change category to">
          {CATEGORIES.filter((c) => c !== shown).map((c) => (
            <option key={c} value={`recategorize:${c}`}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </optgroup>
      </select>
      <SubmitButton pendingText="Saving…" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:brightness-95">
        Save
      </SubmitButton>
    </form>
  );
}
