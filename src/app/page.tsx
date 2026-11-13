import Link from "next/link";
import { getReplyDetail, listReplies } from "@/db/queries";
import { ReplyRow } from "@/components/ReplyRow";
import { ResultPanel } from "@/components/ResultPanel";
import { TryForm } from "@/components/TryForm";
import { sortQueue } from "@/lib/review";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";
// The paste box's Server Action runs inside this route: classify() needs up to ~25 s (two 12 s attempts).
export const maxDuration = 30;

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ pasted?: string; error?: string }> }) {
  const { pasted, error } = await searchParams;

  const [rows, pastedDetail] = await Promise.all([listReplies(), pasted ? getReplyDetail(pasted) : null]);

  // Most concerning first (see lib/review.ts). The priority tiers behind that order stay out of sight in v0.
  // Pasted replies are shown under the box and kept in All replies, never in the queue.
  const queue = sortQueue(
    rows
      .filter((r) => r.reply.source !== "pasted" && r.needsReview)
      .map((r) => ({ ...r, id: r.reply.id, receivedAt: r.reply.receivedAt, reviewReasons: r.reviewReasons ?? [], overrideReasons: r.overrideReasons ?? [] })),
  );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-8">
      <h1 className="sr-only">Review</h1>

      <TryForm error={error} />

      {pastedDetail && (
        <section id="result" className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Result for your pasted reply</h2>
            <Link href={`/replies/${pastedDetail.reply.id}`} className="text-xs text-neutral-500 underline underline-offset-2 hover:text-ink">
              Open full detail · {pastedDetail.reply.id}
            </Link>
          </div>
          <ResultPanel reply={pastedDetail.reply} row={pastedDetail.lastAttempt} correctedTo={pastedDetail.corrections[0]?.toCategory ?? null} />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-base font-semibold">To review</h2>
          <span className="text-sm text-neutral-500">{queue.length} · most urgent first</span>
        </div>
        {queue.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            Nothing to review. Replies show up here once they’re classified and something needs a person’s eye.
          </p>
        ) : (
          <ul className="space-y-3">
            {queue.map((r) => (
              <ReplyRow key={r.id} row={r} variant="review" />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
