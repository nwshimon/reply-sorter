import Link from "next/link";
import { listReplies, type ReplyListRow } from "@/db/queries";
import { ReplyRow } from "@/components/ReplyRow";
import { CATEGORIES, CATEGORY_LABELS, isCategory } from "@/lib/categories";

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
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">All replies</h1>
        <p className="text-sm text-neutral-500">
          Showing {rows.length} of {all.length}, in id order. Categories include any corrections.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-neutral-600">
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-block h-4 w-8 rounded-sm border-l-4 border-l-flag bg-flag-wash ring-1 ring-inset ring-neutral-200" />
            Shaded row = needs review
          </span>
          <span>
            <span className="mr-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500">edited</span>= a person changed the category
          </span>
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
        <span className="mx-1 h-4 w-px bg-neutral-300" />
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
          ? "border-accent bg-tan text-ink"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {children}
    </Link>
  );
}

function Section({ title, hint, rows }: { title: string; hint?: string; rows: ReplyListRow[] }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold">
        {title} <span className="font-normal text-neutral-400">({rows.length})</span>
      </h2>
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {rows.map((r) => (
          <ReplyRow key={r.reply.id} row={r} variant="list" />
        ))}
      </ul>
    </section>
  );
}
