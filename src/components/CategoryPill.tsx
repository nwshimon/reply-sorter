import { CATEGORY_LABELS, CATEGORY_STYLES, type Category } from "@/lib/categories";

// The ONLY coloured pills in the app, one per category (labels and colours live in lib/categories.ts).
// The text label is always shown, never colour alone. Reasons and statuses are plain text or neutral chips.
export function CategoryPill({ category }: { category: Category | null }) {
  if (!category) return <span className="whitespace-nowrap text-xs text-neutral-400">Not classified yet</span>;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${CATEGORY_STYLES[category]}`}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}
