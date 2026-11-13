import { listReplies, queueSection, type QueueSection, type ReplyListRow } from "@/db/queries";
import { Notice } from "@/components/Notice";
import { ReviewCard } from "@/components/ReviewCard";
import { sortQueue } from "@/lib/review";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";

// The three sections, in this order (POLICY.md section 5). Each can be collapsed; only Needs human starts open.
const SECTIONS: { key: QueueSection; title: string; hint: string; empty: string }[] = [
  { key: "needs_human", title: "Needs human", hint: "Check and set the right category.", empty: "Nothing needs a category right now." },
  { key: "confirm_payment", title: "Confirm payment", hint: "The customer says they paid. Confirm the money arrived.", empty: "No payments to confirm." },
  { key: "dispute", title: "Dispute", hint: "Settle with the customer outside the app, then mark resolved.", empty: "No disputes to settle." },
];

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ notice?: string; kind?: string }> }) {
  const { notice, kind } = await searchParams;
  const all = await listReplies();

  // Only replies In review. Inside each section the most concerning come first (see lib/review.ts).
  const inReview = all.filter((r) => r.status === "in_review" && r.shownCategory);
  const bySection = new Map<QueueSection, ReplyListRow[]>();
  for (const s of SECTIONS) bySection.set(s.key, []);
  for (const r of inReview) bySection.get(queueSection(r.shownCategory!)!)!.push(r);
  const sorted = (rows: ReplyListRow[]) =>
    sortQueue(rows.map((r) => ({ ...r, id: r.reply.id, receivedAt: r.reply.receivedAt, reviewReasons: r.reviewReasons ?? [], overrideReasons: r.overrideReasons ?? [] })));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-neutral-500">{inReview.length === 0 ? "Queue is clear." : `${inReview.length} ${inReview.length === 1 ? "reply is" : "replies are"} waiting for a person.`}</p>
      </header>

      <Notice message={notice} kind={kind} />

      {inReview.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">Queue is clear.</p>
      ) : (
        SECTIONS.map(({ key, title, hint, empty }) => {
          const rows = sorted(bySection.get(key)!);
          return (
            // Native <details>: click the heading to collapse or expand a section.
            <details key={key} open={key === "needs_human"} className="group">
              <summary className="flex cursor-pointer list-none items-start gap-2 rounded-lg py-1 hover:bg-neutral-100/60 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="mt-1 inline-block text-neutral-400 transition group-open:rotate-90">▸</span>
                <span>
                  <h2 className="text-base font-semibold">
                    {title} <span className="font-normal text-neutral-400">({rows.length})</span>
                  </h2>
                  <p className="text-sm text-neutral-500">{hint}</p>
                </span>
              </summary>
              <div className="mt-3">
                {rows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-5 text-sm text-neutral-500">{empty}</p>
                ) : (
                  <ul className="space-y-3">
                    {rows.map((r) => (
                      <ReviewCard key={r.id} row={r} section={key} />
                    ))}
                  </ul>
                )}
              </div>
            </details>
          );
        })
      )}
    </main>
  );
}
