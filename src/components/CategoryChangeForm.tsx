import { reviewAction } from "@/app/actions";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";
import { SubmitButton } from "./SubmitButton";

const field = "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
const primary = "rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:brightness-95";

/** Change a reply's category: a dropdown of all six and Save. The current category can't be picked. */
export function CategoryChangeForm({ replyId, shown, returnTo }: { replyId: string; shown: Category; returnTo: string }) {
  return (
    <form action={reviewAction} className="flex flex-wrap gap-2">
      <input type="hidden" name="replyId" value={replyId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="sr-only" htmlFor={`to-${replyId}`}>
        Category
      </label>
      <select id={`to-${replyId}`} name="to" required defaultValue="" className={`${field} min-w-0 flex-1 sm:flex-none`}>
        <option value="" disabled>
          Choose a category…
        </option>
        {CATEGORIES.map((c) => (
          <option key={c} value={c} disabled={c === shown}>
            {CATEGORY_LABELS[c]}
            {c === shown ? " (current)" : ""}
          </option>
        ))}
      </select>
      <SubmitButton name="intent" value="recategorize" pendingText="Saving…" className={primary}>
        Save
      </SubmitButton>
    </form>
  );
}
