import { reviewAction } from "@/app/actions";
import type { QueueSection } from "@/db/queries";
import type { Category } from "@/lib/categories";
import { CategoryChangeForm } from "./CategoryChangeForm";
import { SubmitButton } from "./SubmitButton";

/**
 * The action for one queued reply, by section (POLICY.md section 5):
 *   Needs human      category dropdown + Save
 *   Confirm payment  ✓ Payment confirmed / ✗ Not found (no dropdown)
 *   Dispute          "Resolved offline" (no category change here; the detail page has it)
 * Used on the review cards and, for a queued reply, on its detail page.
 */
export function ReviewActions({ replyId, section, shown, returnTo }: { replyId: string; section: QueueSection; shown: Category; returnTo: string }) {
  if (section === "needs_human") return <CategoryChangeForm replyId={replyId} shown={shown} returnTo={returnTo} />;

  return (
    <form action={reviewAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="replyId" value={replyId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {section === "confirm_payment" ? (
        <>
          <SubmitButton name="intent" value="confirm_paid" pendingText="Saving…" className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700">
            ✓ Payment confirmed
          </SubmitButton>
          <SubmitButton name="intent" value="reject_paid" pendingText="Saving…" className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-neutral-100">
            ✗ Not found
          </SubmitButton>
        </>
      ) : (
        <SubmitButton name="intent" value="resolve_offline" pendingText="Saving…" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:brightness-95">
          Resolved offline
        </SubmitButton>
      )}
    </form>
  );
}
