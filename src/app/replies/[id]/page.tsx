import Link from "next/link";
import { notFound } from "next/navigation";
import { getReplyDetail, queueSection, STATUS_LABELS } from "@/db/queries";
import { CategoryChangeForm } from "@/components/CategoryChangeForm";
import { CategoryPill } from "@/components/CategoryPill";
import { LocalTime } from "@/components/LocalTime";
import { Notice } from "@/components/Notice";
import { ReasonChips } from "@/components/ReasonChips";
import { FoundList } from "@/components/ReplyFacts";
import { ReplyBody } from "@/components/ReplyBody";
import { ReviewActions } from "@/components/ReviewActions";
import { CATEGORY_LABELS } from "@/lib/categories";
import type { ModelDetails } from "@/lib/classifier/schema";
import { classifierFailure } from "@/lib/errors";
import { calendarDate, money } from "@/lib/format";
import { reasonChips } from "@/lib/reasons";

// Reads live data from Postgres on every request (Cache Components is off; see next.config.ts).
export const dynamic = "force-dynamic";

const ACTION_LABELS = {
  recategorize: "Changed category",
  confirm_paid: "Payment confirmed",
  reject_paid: "Payment not found",
  resolve_offline: "Resolved offline",
  keep: "Kept as Needs human",
} as const;

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">{children}</h3>;
}

export default async function ReplyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; kind?: string }> }) {
  const { id } = await params;
  const { notice, kind } = await searchParams;
  const detail = await getReplyDetail(decodeURIComponent(id));
  if (!detail) notFound();
  const { reply, current, lastAttempt, failedOnly, corrections, runs, shownCategory, status } = detail;

  const row = current ?? (failedOnly ? lastAttempt : null);
  const details = (current?.details ?? null) as ModelDetails | null;
  const section = shownCategory && status === "in_review" ? queueSection(shownCategory) : null;
  const chips = reasonChips({
    overrideReasons: row?.overrideReasons ?? [],
    reviewReasons: row?.reviewReasons ?? [],
    latestAction: corrections[0]?.action,
    shown: shownCategory,
  });
  const returnTo = `/replies/${reply.id}`;

  // Newest first: corrections and classification runs together.
  const timeline = [
    ...corrections.map((c) => ({
      key: `c${c.id}`,
      at: c.createdAt,
      title: ACTION_LABELS[c.action],
      sub: `${c.fromCategory ? CATEGORY_LABELS[c.fromCategory] : "Not classified"} → ${CATEGORY_LABELS[c.toCategory]}`,
      note: c.note,
    })),
    ...runs.map((r) => ({
      key: `r${r.id}`,
      at: r.createdAt,
      title: r.error ? "Classification failed" : "Classified",
      sub: `${r.model} · prompt ${r.promptVersion}${r.error ? ` · ${classifierFailure(r.error)}` : ` · ${CATEGORY_LABELS[r.finalCategory]}`}`,
      note: null as string | null,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-8">
      <nav className="text-sm text-neutral-500">
        <Link href="/" className="hover:underline">
          Replies
        </Link>{" "}
        / #{reply.id}
      </nav>

      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{reply.customer}</h1>
        <CategoryPill category={shownCategory} />
        <span className="text-sm text-neutral-600">{status ? STATUS_LABELS[status] : "Not classified"}</span>
        <span className="font-mono text-sm text-neutral-500">{reply.invoiceNumber}</span>
        {reply.source === "pasted" && <span className="text-xs text-neutral-400">Pasted reply</span>}
      </header>

      <Notice message={notice} kind={kind} />

      {lastAttempt?.error && (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The classifier couldn’t process this reply ({classifierFailure(lastAttempt.error)}).{" "}
          {failedOnly ? "It was sent to Needs human." : "Showing the last successful result."}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {/* Left: the reply, then one collapsible block with the invoice, what we found and why */}
        <div className="space-y-4">
          <Card title="Reply">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-neutral-500">Subject</dt>
              <dd className="min-w-0 break-words">{reply.subject}</dd>
              <dt className="text-neutral-500">From</dt>
              <dd className="min-w-0 break-words">{reply.sender}</dd>
              <dt className="text-neutral-500">Received</dt>
              <dd>
                <LocalTime iso={reply.receivedAt.toISOString()} mode="datetime" />
              </dd>
            </dl>
            <div className="rounded-lg bg-neutral-50 p-3">
              <ReplyBody body={reply.body} />
            </div>
          </Card>

          <details open className="group rounded-xl border border-neutral-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="inline-block text-neutral-400 transition group-open:rotate-90">▸</span>
              Invoice, what we found and why
            </summary>
            <div className="space-y-5 border-t border-neutral-100 p-4">
              <div>
                <SubHeading>Invoice</SubHeading>
                <p className="text-sm">
                  <span className="font-mono">{reply.invoiceNumber}</span> · {money(reply.invoiceAmount, reply.currency)} {reply.currency}
                  <span className="block text-xs text-neutral-500">Due {calendarDate(reply.dueDate)}</span>
                </p>
              </div>

              <div>
                <SubHeading>What we found</SubHeading>
                <FoundList details={details} currency={reply.currency} receivedAt={reply.receivedAt} />
              </div>

              <div>
                <SubHeading>Why</SubHeading>
                {current ? (
                  <div className="space-y-2">
                    <p className="text-sm leading-relaxed">{current.reasoning}</p>
                    <p className="text-xs text-neutral-500">Model confidence: {current.confidence ?? "not given"}</p>
                    <ReasonChips chips={chips} />
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">{failedOnly ? "The classifier didn’t produce an answer for this reply." : "This reply hasn’t been classified for the current model and prompt version."}</p>
                )}
              </div>
            </div>
          </details>
        </div>

        {/* Right: actions, history and the raw model output */}
        <div className="space-y-4">
          {shownCategory && (
            <Card title="Actions">
              {section && section !== "needs_human" && (
                <div className="pb-3">
                  <p className="mb-2 text-sm font-medium">{section === "confirm_payment" ? "Confirm the payment" : "Settle this dispute"}</p>
                  <ReviewActions replyId={reply.id} section={section} shown={shownCategory} returnTo={returnTo} />
                </div>
              )}
              {section === "needs_human" ? (
                <>
                  <p className="mb-2 text-sm font-medium">Set the right category</p>
                  <ReviewActions replyId={reply.id} section="needs_human" shown={shownCategory} returnTo={returnTo} />
                </>
              ) : (
                <>
                  <p className="mb-2 text-sm font-medium">Change category</p>
                  <CategoryChangeForm replyId={reply.id} shown={shownCategory} returnTo={returnTo} />
                </>
              )}
            </Card>
          )}

          <Card title="History">
            {timeline.length === 0 ? (
              <p className="text-sm text-neutral-500">Nothing yet.</p>
            ) : (
              <ol className="space-y-3">
                {timeline.map((e) => (
                  <li key={e.key} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{e.title}</span>
                      <span className="whitespace-nowrap text-xs text-neutral-500">
                        <LocalTime iso={e.at.toISOString()} mode="datetime" />
                      </span>
                    </div>
                    <p className="text-xs text-neutral-600">{e.sub}</p>
                    {e.note && <p className="mt-0.5 text-xs text-neutral-700">“{e.note}”</p>}
                  </li>
                ))}
              </ol>
            )}
            <p className="pt-1 text-xs text-neutral-400">Corrections change what the app shows. They never change the evaluation.</p>
          </Card>

          {current?.rawOutput != null && (
            <details className="rounded-xl border border-neutral-200 bg-white p-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-neutral-500">Raw model output</summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-neutral-50 p-3 text-xs">{JSON.stringify(current.rawOutput, null, 2)}</pre>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
