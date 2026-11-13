import Link from "next/link";
import { listReplies, STATUS_LABELS, type ReplyListRow, type ReplyStatus } from "@/db/queries";
import { ReplyTable } from "@/components/ReplyTable";
import { CATEGORIES, CATEGORY_LABELS, isCategory } from "@/lib/categories";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";

type Search = { category?: string; status?: string; q?: string };
const STATUSES: ReplyStatus[] = ["automatic", "in_review", "resolved"];

const href = (s: Search) => {
  const q = new URLSearchParams();
  if (s.category) q.set("category", s.category);
  if (s.status) q.set("status", s.status);
  if (s.q) q.set("q", s.q);
  return q.size ? `/replies?${q}` : "/replies";
};

function Chip({ to, active, label, count }: { to: string; active: boolean; label: string; count: number }) {
  return (
    <Link
      href={to}
      aria-current={active ? "true" : undefined}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? "border-accent bg-tan text-ink" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {label} <span className="text-neutral-400">{count}</span>
    </Link>
  );
}

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

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">All Replies</h1>
        <p className="text-sm text-neutral-500">
          Showing {rows.length} of {all.length}, newest first.
        </p>
      </header>

      <form method="get" action="/replies" className="flex gap-2">
        {category && <input type="hidden" name="category" value={category} />}
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by customer or invoice number"
          aria-label="Search by customer or invoice number"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium transition hover:bg-neutral-100">Search</button>
        {q && (
          <Link href={href({ category, status })} className="self-center text-xs text-neutral-500 underline underline-offset-2">
            Clear
          </Link>
        )}
      </form>

      <div className="space-y-2">
        <nav aria-label="Filter by category" className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs uppercase tracking-wide text-neutral-400">Category</span>
          <Chip to={href({ status, q })} active={!category} label="All" count={all.filter((r) => matches(r, "category")).length} />
          {CATEGORIES.map((c) => (
            <Chip key={c} to={href({ category: c, status, q })} active={category === c} label={CATEGORY_LABELS[c]} count={categoryCount(c)} />
          ))}
          {unclassified > 0 && <Chip to={href({ category: "none", status, q })} active={category === "none"} label="Not classified" count={categoryCount("none")} />}
        </nav>
        <nav aria-label="Filter by status" className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs uppercase tracking-wide text-neutral-400">Status</span>
          <Chip to={href({ category, q })} active={!status} label="All" count={all.filter((r) => matches(r, "status")).length} />
          {STATUSES.map((s) => (
            <Chip key={s} to={href({ category, status: s, q })} active={status === s} label={STATUS_LABELS[s]} count={statusCount(s)} />
          ))}
        </nav>
      </div>

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
