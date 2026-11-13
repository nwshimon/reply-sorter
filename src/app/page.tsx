import Link from "next/link";
import { getReplyDetail, listReplies } from "@/db/queries";
import { CategoryPill } from "@/components/CategoryPill";
import { ReviewReasonChips } from "@/components/ReasonChips";
import { ResultPanel } from "@/components/ResultPanel";
import { TryForm } from "@/components/TryForm";
import { money, shortDate } from "@/lib/format";
import { QUEUE_TIERS, queueTier, sortQueue } from "@/lib/review";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";
// The paste box's Server Action runs inside this route: classify() needs up to ~25 s (two 12 s attempts).
export const maxDuration = 30;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ pasted?: string; error?: string }> }) {
  const { pasted, error } = await searchParams;

  const [rows, pastedDetail] = await Promise.all([listReplies(), pasted ? getReplyDetail(pasted) : null]);

  // Pasted replies are shown right under the box and kept in All replies, never in the queue.
  const queue = sortQueue(
    rows
      .filter((r) => r.reply.source !== "pasted" && r.needsReview)
      .map((r) => ({ ...r, id: r.reply.id, receivedAt: r.reply.receivedAt, reviewReasons: r.reviewReasons ?? [], overrideReasons: r.overrideReasons ?? [] })),
  );

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 sm:px-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-neutral-500">
          {queue.length} {queue.length === 1 ? "reply needs" : "replies need"} a person, most concerning first. A correction changes the category you see; the reply stays here.
        </p>
      </header>

      <TryForm error={error} />

      {pastedDetail && (
        <section id="result" className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">Result for your pasted reply</h2>
            <Link href={`/replies/${pastedDetail.reply.id}`} className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200">
              Open full detail · {pastedDetail.reply.id}
            </Link>
          </div>
          <ResultPanel reply={pastedDetail.reply} row={pastedDetail.lastAttempt} correctedTo={pastedDetail.corrections[0]?.toCategory ?? null} />
        </section>
      )}

      {queue.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          Nothing to review. Replies show up here once they’re classified and something needs a person’s eye.
        </p>
      ) : (
        QUEUE_TIERS.map(({ tier, title, hint }) => {
          const inTier = queue.filter((r) => queueTier(r) === tier);
          if (inTier.length === 0) return null;
          return (
            <section key={tier}>
              <h2 className="text-sm font-medium">
                {title} <span className="font-normal text-neutral-400">({inTier.length})</span>
              </h2>
              <p className="text-xs text-neutral-500">{hint}</p>
              <ul className="mt-2 divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                {inTier.map((r) => (
                  <li key={r.id}>
                    <Link href={`/replies/${r.id}`} className="block space-y-2 px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-900/60">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-xs text-neutral-500">#{r.id}</span>
                        <span className="text-sm font-medium">{r.reply.customer}</span>
                        <CategoryPill category={r.shownCategory} edited={!!r.correctedTo} />
                        <span className="ml-auto whitespace-nowrap text-xs text-neutral-500">
                          {r.reply.invoiceNumber} · {money(r.reply.invoiceAmount, r.reply.currency)} · {shortDate(r.reply.receivedAt)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-sm text-neutral-700 dark:text-neutral-300">{r.reply.body}</p>
                      <ReviewReasonChips reasons={r.reviewReasons} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
