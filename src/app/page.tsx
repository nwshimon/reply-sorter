import Link from "next/link";
import { listReplies, STATUS_LABELS, type ReplyStatus } from "@/db/queries";
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
  return q.size ? `/?${q}` : "/";
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

export default async function RepliesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const category = sp.category === "none" || isCategory(sp.category) ? sp.category : undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const q = (sp.q ?? "").trim().slice(0, 80);

  const all = await listReplies(); // newest first
  const matches = (r: (typeof all)[number], skip: "category" | "status" | null) =>
    (skip === "category" || !category || (category === "none" ? r.shownCategory === null : r.shownCategory === category)) &&
    (skip === "status" || !status || r.status === status) &&
    (!q || `${r.reply.customer} ${r.reply.invoiceNumber}`.toLowerCase().includes(q.toLowerCase()));

  // Counts on each chip reflect the other active filters, so they say what you'd get by clicking.
  const categoryCount = (c: string) => all.filter((r) => matches(r, "category") && (c === "none" ? r.shownCategory === null : r.shownCategory === c)).length;
  const statusCount = (s: ReplyStatus) => all.filter((r) => matches(r, "status") && r.status === s).length;
  const rows = all.filter((r) => matches(r, null));
  const unclassified = all.filter((r) => r.shownCategory === null).length;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Replies</h1>
        <p className="text-sm text-neutral-500">
          Showing {rows.length} of {all.length}, newest first.
        </p>
      </header>

      <form method="get" action="/" className="flex gap-2">
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

      {rows.length === 0 ? <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">No replies match these filters.</p> : <ReplyTable rows={rows} />}
    </main>
  );
}
