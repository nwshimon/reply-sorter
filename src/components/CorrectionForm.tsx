import { correctCategory } from "@/app/actions";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/lib/categories";

/** One click on a category (plus an optional note typed first) saves the correction. */
export function CorrectionForm({ replyId, shown }: { replyId: string; shown: Category | null }) {
  return (
    <form action={correctCategory} className="space-y-3">
      <input type="hidden" name="replyId" value={replyId} />
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-neutral-500">Note (optional)</span>
        <input
          name="note"
          maxLength={500}
          placeholder="Why this category?"
          className="mt-1 w-full rounded-md border border-neutral-300 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-700"
        />
      </label>
      <div>
        <p className="mb-1.5 text-xs uppercase tracking-wide text-neutral-500">Change the category to</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              name="to"
              value={c}
              disabled={c === shown}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-100 disabled:cursor-default disabled:border-transparent disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:disabled:bg-neutral-900"
            >
              {CATEGORY_LABELS[c]}
              {c === shown && " (current)"}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
