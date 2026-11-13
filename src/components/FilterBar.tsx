"use client";

import Link from "next/link";

export type FilterOption = { value: string; label: string; count: number };

const control = "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";

/**
 * Search plus two dropdowns (category, status). Changing a dropdown applies it straight away; the counts beside each
 * option say how many replies you'd get. It's a plain GET form, so the filters live in the URL and can be shared.
 */
export function FilterBar({
  q,
  category,
  status,
  categories,
  statuses,
}: {
  q: string;
  category: string;
  status: string;
  categories: FilterOption[];
  statuses: FilterOption[];
}) {
  const active = Boolean(q || category || status);
  return (
    <form
      method="get"
      action="/replies"
      className="flex flex-wrap items-center gap-2"
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      <input name="q" defaultValue={q} placeholder="Search customer or invoice" aria-label="Search by customer or invoice number" className={`${control} min-w-0 flex-1 sm:flex-none sm:w-64`} />
      <select name="category" defaultValue={category} aria-label="Category" className={control}>
        <option value="">All categories</option>
        {categories.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
      <select name="status" defaultValue={status} aria-label="Status" className={control}>
        <option value="">All statuses</option>
        {statuses.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label} ({o.count})
          </option>
        ))}
      </select>
      <button className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-neutral-100">Search</button>
      {active && (
        <Link href="/replies" className="text-xs text-neutral-500 underline underline-offset-2 hover:text-ink">
          Clear
        </Link>
      )}
    </form>
  );
}
