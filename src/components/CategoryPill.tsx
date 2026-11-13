import { CATEGORY_LABELS, type Category } from "@/lib/categories";

// The ONLY coloured pills in the app, and there is one per category. Reasons, flags and everything else
// are plain text. Full class names (not built from strings) so Tailwind can see them.
const STYLES: Record<Category, string> = {
  paid: "bg-[#dff2e4] text-[#1f6b3a] ring-[#40a55e]/35",
  promise_to_pay: "bg-tan text-accent-dark ring-accent/45",
  dispute: "bg-[#f9dccb] text-[#9a3f12] ring-[#d9702f]/30",
  resend_invoice: "bg-[#dde7f3] text-[#2f4c73] ring-[#5b86b8]/30",
  out_of_office: "bg-neutral-100 text-neutral-600 ring-neutral-300",
  needs_human: "bg-[#f8d7d3] text-[#a3281b] ring-[#d6574a]/30",
};

export function CategoryPill({ category, edited = false }: { category: Category | null; edited?: boolean }) {
  if (!category) {
    return <span className="whitespace-nowrap text-xs text-neutral-400">Not classified yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[category]}`}>
        {CATEGORY_LABELS[category]}
      </span>
      {edited && (
        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-500" title="A person changed this category">
          edited
        </span>
      )}
    </span>
  );
}
