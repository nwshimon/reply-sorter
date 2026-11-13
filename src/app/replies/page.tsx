import { listReplies, STATUS_LABELS, type ReplyListRow, type ReplyStatus } from "@/db/queries";
import { FilterBar, type FilterOption } from "@/components/FilterBar";
import { ReplyTable } from "@/components/ReplyTable";
import { CATEGORIES, CATEGORY_LABELS, isCategory } from "@/lib/categories";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";

type Search = { category?: string; status?: string; q?: string };
const STATUSES: ReplyStatus[] = ["automatic", "in_review", "resolved"];

/**
 * Two separate tables: the data we were GIVEN (the 40 dataset replies), and "Other tests": everything else
 * (replies pasted on Try a reply). Keeping them apart means test replies never mix into the given data.
 */
export default async function AllRepliesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const category = sp.category === "none" || isCategory(sp.category) ? sp.category : undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const q = (sp.q ?? "").trim().slice(0, 80);

  const all = await listReplies(); // newest first
  const matches = (r: ReplyListRow, skip: "category" | "status" | null) =>
    (skip === "category" || !category || (category === "none" ? r.shownCategory === null : r.shownCategory === category)) &&
    (skip === "status" || !status || r.status === status) &&
    (!q || `${r.reply.customer} ${r.reply.invoiceNumber}`.toLowerCase().includes(q.toLowerCase()));

  // Counts on each chip reflect the other active filters, so they say what you'd get by clicking.
  const categoryCount = (c: string) => all.filter((r) => matches(r, "category") && (c === "none" ? r.shownCategory === null : r.shownCategory === c)).length;
  const statusCount = (s: ReplyStatus) => all.filter((r) => matches(r, "status") && r.status === s).length;
  const rows = all.filter((r) => matches(r, null));
  const given = rows.filter((r) => r.reply.source === "dataset");
  const tests = rows.filter((r) => r.reply.source !== "dataset");
  const totalGiven = all.filter((r) => r.reply.source === "dataset").length;
  const totalTests = all.length - totalGiven;
  const unclassified = all.filter((r) => r.shownCategory === null).length;
  const categoryOptions: FilterOption[] = [
    ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c], count: categoryCount(c) })),
    ...(unclassified > 0 ? [{ value: "none", label: "Not classified", count: categoryCount("none") }] : []),
  ];
  const statusOptions: FilterOption[] = STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], count: statusCount(s) }));

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">All Replies</h1>
        <p className="text-sm text-neutral-500">
          Showing {rows.length} of {all.length}, newest first.
        </p>
      </header>

      <FilterBar q={q} category={category ?? ""} status={status ?? ""} categories={categoryOptions} statuses={statusOptions} />

      <section aria-labelledby="given-data" className="space-y-2">
        <div>
          <h2 id="given-data" className="text-base font-semibold">
            Given data <span className="font-normal text-neutral-400">({given.length}{given.length !== totalGiven ? ` of ${totalGiven}` : ""})</span>
          </h2>
          <p className="text-sm text-neutral-500">The replies we were given, scored against the hand labels.</p>
        </div>
        {given.length === 0 ? <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">No replies match these filters.</p> : <ReplyTable rows={given} />}
      </section>

      <section aria-labelledby="other-tests" className="space-y-2">
        <div>
          <h2 id="other-tests" className="text-base font-semibold">
            Other tests <span className="font-normal text-neutral-400">({tests.length}{tests.length !== totalTests ? ` of ${totalTests}` : ""})</span>
          </h2>
          <p className="text-sm text-neutral-500">Anything outside the given data, such as replies pasted on Try a reply. Never part of the evaluation.</p>
        </div>
        {tests.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
            {totalTests === 0 ? "No other tests yet. Replies you paste on Try a reply appear here." : "No other tests match these filters."}
          </p>
        ) : (
          <ReplyTable rows={tests} />
        )}
      </section>
    </main>
  );
}
