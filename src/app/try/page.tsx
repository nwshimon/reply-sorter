import { randomBytes } from "node:crypto";
import Link from "next/link";
import { getReplyDetail, nextStepText, STATUS_LABELS } from "@/db/queries";
import { CategoryPill } from "@/components/CategoryPill";
import { FoundList, RulesApplied } from "@/components/ReplyFacts";
import { TryForm } from "@/components/TryForm";
import type { ModelDetails } from "@/lib/classifier/schema";
import { classifierFailure } from "@/lib/errors";
import { TRY_EXAMPLES } from "@/lib/examples";
import { sampleDueDate } from "@/lib/format";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";
// The paste form's Server Action runs inside this route: classify() needs up to ~25 s (two 12 s attempts).
export const maxDuration = 30;

export default async function TryPage({ searchParams }: { searchParams: Promise<{ result?: string; error?: string }> }) {
  const { result, error } = await searchParams;
  const detail = result ? await getReplyDetail(result) : null;
  // One id per rendered form: submitting the same form twice can only ever create one reply.
  const submissionId = randomBytes(3).toString("hex");

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Try a reply</h1>
        <p className="text-sm text-neutral-500">Paste a customer reply to see how it’s sorted and what would happen next. It’s saved like any other reply.</p>
      </header>

      <TryForm examples={TRY_EXAMPLES} submissionId={submissionId} defaultDue={sampleDueDate()} error={error} />

      {detail && (
        <section id="result" className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold">Result</h2>
            <CategoryPill category={detail.shownCategory} />
            <span className="text-sm text-neutral-600">{detail.status ? STATUS_LABELS[detail.status] : ""}</span>
          </div>

          {detail.lastAttempt?.error && detail.failedOnly ? (
            <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              The classifier couldn’t process this ({classifierFailure(detail.lastAttempt.error)}). Under our policy it goes to Needs human.
            </p>
          ) : (
            <>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">What happens next</h3>
                <p className="mt-0.5 text-sm">{nextStepText(detail.shownCategory, detail.status)}</p>
              </div>
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">What we found</h3>
                <FoundList details={(detail.current?.details ?? null) as ModelDetails | null} currency={detail.reply.currency} receivedAt={detail.reply.receivedAt} />
              </div>
              {detail.current?.reasoning && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Why</h3>
                  <p className="mt-0.5 text-sm leading-relaxed">{detail.current.reasoning}</p>
                </div>
              )}
              {detail.current && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Rules applied</h3>
                  <RulesApplied overrides={detail.current.overrideReasons} modelCategory={detail.current.modelCategory} final={detail.current.finalCategory} />
                </div>
              )}
            </>
          )}

          <Link href={`/replies/${detail.reply.id}`} className="inline-block text-sm font-medium underline underline-offset-2 hover:text-ink">
            Open details · #{detail.reply.id}
          </Link>
        </section>
      )}
    </main>
  );
}
