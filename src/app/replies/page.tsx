import Link from "next/link";
import { listReplies, type ReplyListRow } from "@/db/queries";
import { CategoryPill } from "@/components/CategoryPill";
import { CATEGORIES, CATEGORY_LABELS, isCategory } from "@/lib/categories";
import type { ModelDetails } from "@/lib/classifier/schema";
import { money, shortDate } from "@/lib/format";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";

type Search = { category?: string; review?: string };

const href = (s: Search) => {
  const q = new URLSearchParams();
  if (s.category) q.set("category", s.category);
  if (s.review) q.set("review", "1");
  return q.size ? `/replies?${q}` : "/replies";
};

export default async function AllRepliesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const category = sp.category === "none" || isCategory(sp.category) ? sp.category : undefined;
  const reviewOnly = sp.review === "1";

  const all = await listReplies();
  const count = (c: string) => all.filter((r) => (c === "none" ? r.shownCategory === null : r.shownCategory === c)).length;
  const rows = all.filter(
    (r) => (!category || (category === "none" ? r.shownCategory === null : r.shownCategory === category)) && (!reviewOnly || r.needsReview),
  );
  const sections = [
    { title: "Dataset", rows: rows.filter((r) => r.reply.source === "dataset") },
    { title: "Held-out set", hint: "Never used to tune the prompt; scored separately.", rows: rows.filter((r) => r.reply.source === "heldout") },
    { title: "Pasted", rows: rows.filter((r) => r.reply.source === "pasted") },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">All replies</h1>
        <p className="text-sm text-neutral-500">
          Showing {rows.length} of {all.length}, in id order. Categories include any corrections.
        </p>
      </header>

      <nav aria-label="Filter by category" className="mt-4 flex flex-wrap items-center gap-2">
        <Chip to={href({ review: reviewOnly ? "1" : undefined })} active={!category}>
          All <span className="text-neutral-400">{all.length}</span>
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip key={c} to={href({ category: c, review: reviewOnly ? "1" : undefined })} active={category === c}>
            {CATEGORY_LABELS[c]} <span className="text-neutral-400">{count(c)}</span>
          </Chip>
        ))}
        {count("none") > 0 && (
          <Chip to={href({ category: "none", review: reviewOnly ? "1" : undefined })} active={category === "none"}>
            Not classified <span className="text-neutral-400">{count("none")}</span>
          </Chip>
        )}
        <span className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
        <Chip to={href({ category, review: reviewOnly ? undefined : "1" })} active={reviewOnly}>
          Needs review only
        </Chip>
      </nav>

      {rows.length === 0 && <p className="mt-8 text-sm text-neutral-500">No replies match this filter.</p>}
      {sections.map((s) => s.rows.length > 0 && <Section key={s.title} {...s} />)}
    </main>
  );
}

function Chip({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </Link>
  );
}

function Section({ title, hint, rows }: { title: string; hint?: string; rows: ReplyListRow[] }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium">
        {title} <span className="font-normal text-neutral-400">({rows.length})</span>
      </h2>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:bg-neutral-900">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Reply</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Details</th>
              <th className="px-3 py-2 text-right font-medium">Invoice</th>
              <th className="px-3 py-2 font-medium">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {rows.map((r) => {
              const d = (r.details ?? null) as ModelDetails | null;
              return (
                <tr key={r.reply.id} className="align-top hover:bg-neutral-50 dark:hover:bg-neutral-900/60">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/replies/${r.reply.id}`} className="underline-offset-2 hover:underline">
                      {r.reply.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.reply.customer}</div>
                    <div className="text-xs text-neutral-500">{r.reply.sender}</div>
                  </td>
                  <td className="max-w-sm px-3 py-2">
                    <Link href={`/replies/${r.reply.id}`} className="line-clamp-2 text-neutral-700 hover:underline dark:text-neutral-300">
                      {r.reply.body}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col items-start gap-1">
                      <CategoryPill category={r.shownCategory} edited={!!r.correctedTo} />
                      {r.needsReview && <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">needs review</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {d?.amount_paid != null && <div>Paid {money(d.amount_paid, r.reply.currency)}</div>}
                    {d?.amount_disputed != null && <div>Disputed {money(d.amount_disputed, r.reply.currency)}</div>}
                    {d?.promised_date && <div>Promised {d.promised_date}</div>}
                    {d && d.amount_paid == null && d.amount_disputed == null && !d.promised_date && <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    <div>{money(r.reply.invoiceAmount, r.reply.currency)}</div>
                    <div className="font-mono text-xs text-neutral-500">{r.reply.invoiceNumber}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-500">{shortDate(r.reply.receivedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
