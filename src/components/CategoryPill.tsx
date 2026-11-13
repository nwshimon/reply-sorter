import { CATEGORY_LABELS, type Category } from "@/lib/categories";

// Full class names (not built from strings) so Tailwind can see them.
const STYLES: Record<Category, string> = {
  paid: "bg-emerald-100 text-emerald-800 ring-emerald-600/25 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30",
  promise_to_pay: "bg-sky-100 text-sky-800 ring-sky-600/25 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-400/30",
  dispute: "bg-orange-100 text-orange-800 ring-orange-600/25 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-400/30",
  resend_invoice: "bg-violet-100 text-violet-800 ring-violet-600/25 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-400/30",
  out_of_office: "bg-neutral-100 text-neutral-700 ring-neutral-500/25 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-400/30",
  needs_human: "bg-rose-100 text-rose-800 ring-rose-600/25 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-400/30",
};

export function CategoryPill({ category, edited = false }: { category: Category | null; edited?: boolean }) {
  if (!category) {
    return <span className="whitespace-nowrap text-xs text-neutral-400">Not classified yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[category]}`}>
        {CATEGORY_LABELS[category]}
      </span>
      {edited && <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500" title="A person changed this category">edited</span>}
    </span>
  );
}
