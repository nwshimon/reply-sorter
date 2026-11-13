import Link from "next/link";
import { notFound } from "next/navigation";
import { getReplyDetail } from "@/db/queries";
import { CategoryPill } from "@/components/CategoryPill";
import { CorrectionForm } from "@/components/CorrectionForm";
import { ResultPanel } from "@/components/ResultPanel";
import { CATEGORY_LABELS } from "@/lib/categories";
import { dateTime, money } from "@/lib/format";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";

export default async function ReplyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getReplyDetail(decodeURIComponent(id));
  if (!detail) notFound();
  const { reply, current, lastAttempt, corrections, shownCategory } = detail;

  // The current result if there is one; otherwise show the newest attempt so a failure is visible.
  const row = current ?? lastAttempt;
  const failedLast = !!lastAttempt?.error && !!current && lastAttempt.id > current.id;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <nav className="text-sm text-neutral-500">
        <Link href="/replies" className="hover:underline">
          All replies
        </Link>{" "}
        / #{reply.id}
      </nav>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">{reply.customer}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {reply.sender} · “{reply.subject}” · received {dateTime(reply.receivedAt)}
        </p>
        <p className="text-sm text-neutral-500">
          Invoice {reply.invoiceNumber} · {money(reply.invoiceAmount, reply.currency)} · due {reply.dueDate}
          {reply.source !== "dataset" && ` · ${reply.source === "heldout" ? "held-out set" : "pasted reply"}`}
        </p>
      </header>

      {failedLast && (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          The most recent run for this reply failed ({lastAttempt!.error}). The result below is from the last successful run.
        </p>
      )}

      <ResultPanel reply={reply} row={row} correctedTo={corrections[0]?.toCategory ?? null} />

      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 text-sm font-medium">Correct the category</h2>
        <CorrectionForm replyId={reply.id} shown={shownCategory} />
      </section>

      {corrections.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Corrections</h2>
          <ul className="space-y-2">
            {corrections.map((c) => (
              <li key={c.id} className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                <div className="flex flex-wrap items-center gap-2">
                  {c.fromCategory ? <CategoryPill category={c.fromCategory} /> : <span className="text-xs text-neutral-400">unclassified</span>}
                  <span aria-hidden className="text-neutral-400">→</span>
                  <CategoryPill category={c.toCategory} />
                  <span className="ml-auto text-xs text-neutral-500">{dateTime(c.createdAt)}</span>
                </div>
                {c.note && <p className="mt-2 text-neutral-700 dark:text-neutral-300">{c.note}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Corrections change what the app shows ({CATEGORY_LABELS[shownCategory ?? "needs_human"]} now). They are never part of the evaluation, which scores the system against the hand labels.
          </p>
        </section>
      )}
    </main>
  );
}
