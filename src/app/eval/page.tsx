import Link from "next/link";
import { buildEval, type EvalResult } from "@/db/eval";
import { getActiveRun } from "@/db/queries";
import { CategoryPill } from "@/components/CategoryPill";
import { ConfusionMatrix } from "@/components/ConfusionMatrix";
import { ConcernsLine } from "@/components/Concerns";
import { CATEGORY_LABELS } from "@/lib/categories";
import { pct } from "@/lib/metrics";
import { describeConcerns } from "@/lib/review";

// Metrics come from the same code as `npm run eval` (src/db/eval.ts), scored against my labels only.
export const dynamic = "force-dynamic";

export default async function EvalPage() {
  const run = getActiveRun();
  const [dataset, heldout] = await Promise.all([buildEval(run, "dataset"), buildEval(run, "heldout")]);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-12 px-4 py-8 sm:px-8">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Evaluation</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Scored against the hand labels in <span className="font-mono">data/labels.json</span>. Corrections made in the app never change these numbers.
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          <span className="font-mono">{run.model}</span> · prompt {run.promptVersion}. Numbers are only for this model and prompt version.
        </p>
      </header>

      <EvalSection title="Dataset (40 replies)" result={dataset} />
      <EvalSection
        title="Held-out set (12 replies)"
        subtitle="Never used to tune the prompt, and run once on the final prompt version. Reported separately."
        result={heldout}
        emptyHint="Not run yet."
      />
    </main>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-emerald-600" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

const ids = (list: string[]) => list.map((i) => `#${i}`).join(", ");

function EvalSection({ title, subtitle, result, emptyHint }: { title: string; subtitle?: string; result: EvalResult; emptyHint?: string }) {
  const m = result.metrics;
  const cov = m.coverage;

  if (cov.scored === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
        <p className="mt-3 rounded-lg border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">
          {emptyHint ?? "No results yet."} 0 of {cov.total} replies have a result for this model and prompt version.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-neutral-500">{subtitle}</p>}
      </div>

      {cov.scored < cov.total && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Partial run: {cov.scored} of {cov.total} replies have a result</strong>
          {cov.failed > 0 && `, ${cov.failed} failed`}
          {cov.missing > 0 && `, ${cov.missing} not run`}. These numbers cover only those replies.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="False paid"
          value={String(m.final.falsePaid.count)}
          tone={m.final.falsePaid.count === 0 ? "good" : "bad"}
          sub={
            m.final.falsePaid.count === 0
              ? `Nothing wrongly marked paid${m.model.falsePaid.count ? ` (the model alone had ${m.model.falsePaid.count})` : ""}`
              : ids(m.final.falsePaid.ids)
          }
        />
        <Stat label="Coverage" value={`${cov.scored}/${cov.total}`} sub={cov.failed ? `${cov.failed} failed` : "every reply has a result"} />
        <Stat label="Accuracy" value={pct(m.final.accuracy)} sub={`model alone ${pct(m.model.accuracy)}`} />
        <Stat label="Review rate" value={pct(m.reviewRate)} sub={`${m.reviewed} of ${cov.scored} sent to a person`} />
      </div>

      <div className="space-y-1 text-sm text-neutral-600">
        <p>
          Wrong answers: <strong>{m.wrong}</strong>
          {m.wrongNotReviewed.count > 0
            ? `. ${m.wrongNotReviewed.count} of them weren't in the review queue, so nobody would see them (${ids(m.wrongNotReviewed.ids)}).`
            : ", and every one is in the review queue."}
        </p>
        <p>
          Missed paid (labelled paid, not marked paid): <strong>{m.final.missedPaid.count}</strong>
          {m.final.missedPaid.count > 0 && ` (${ids(m.final.missedPaid.ids)})`}. That’s the safe direction: a person checks it.
        </p>
        <p>
          Code rules changed {m.rulesChanged.count} answer{m.rulesChanged.count === 1 ? "" : "s"}: {m.rulesChanged.fixed.length} became correct, {m.rulesChanged.broke.length} became wrong
          {m.rulesChanged.broke.length > 0 && ` (${ids(m.rulesChanged.broke)})`}.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Precision and recall per category</h3>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left font-medium">Category</th>
                <th rowSpan={2} className="px-3 py-2 text-right font-medium" title="Replies my labels put in this category">Examples</th>
                <th colSpan={2} className="border-l border-neutral-200 px-3 py-1 text-center font-medium">Model alone</th>
                <th colSpan={2} className="border-l border-neutral-200 px-3 py-1 text-center font-medium">After code rules (shown in the app)</th>
              </tr>
              <tr>
                {["Precision", "Recall", "Precision", "Recall"].map((h, i) => (
                  <th key={i} className={`px-3 py-1 text-right font-medium ${i % 2 === 0 ? "border-l border-neutral-200" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 tabular-nums">
              {m.final.perCategory.map((f, i) => {
                const a = m.model.perCategory[i];
                return (
                  <tr key={f.category}>
                    <td className="px-3 py-2"><CategoryPill category={f.category} /></td>
                    <td className={`px-3 py-2 text-right ${f.support <= 3 ? "text-amber-700" : ""}`} title={f.support <= 3 ? "Few examples: read these percentages with care" : undefined}>{f.support}</td>
                    <td className="border-l border-neutral-100 px-3 py-2 text-right text-neutral-500">{pct(a.precision)}</td>
                    <td className="px-3 py-2 text-right text-neutral-500">{pct(a.recall)}</td>
                    <td className="border-l border-neutral-100 px-3 py-2 text-right font-medium">{pct(f.precision)}</td>
                    <td className="px-3 py-2 text-right font-medium">{pct(f.recall)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Precision: of the replies the system put in a category, how many my labels agree with. Recall: of the replies I labelled that way, how many the system found. n/a means nothing to measure. Amber example counts are small, so a single reply moves the percentage a lot.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Confusion matrix (after code rules)</h3>
        <ConfusionMatrix matrix={m.final.confusion} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Every mismatch ({m.mismatches.length})</h3>
        {m.mismatches.length === 0 ? (
          <p className="text-sm text-neutral-500">None: every reply matches my label.</p>
        ) : (
          <ul className="space-y-3">
            {m.mismatches.map((r) => (
              <li key={r.id} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Link href={`/replies/${r.id}`} className="font-mono text-xs underline underline-offset-2">#{r.id}</Link>
                  <span className="text-xs text-neutral-500">my label</span><CategoryPill category={r.label} />
                  <span className="text-xs text-neutral-500">model alone</span><CategoryPill category={r.model} />
                  <span className="text-xs text-neutral-500">shown</span><CategoryPill category={r.final} />
                  {!r.needsReview && <span className="text-xs font-medium text-red-700">not in the review queue</span>}
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap rounded-md bg-neutral-50 p-2.5 text-sm">{r.body}</p>
                {r.reasoning && <p className="text-sm text-neutral-600"><span className="text-xs uppercase tracking-wide text-neutral-500">Reasoning </span>{r.reasoning}</p>}
                {r.needsReview && (
                  <ConcernsLine concerns={describeConcerns({ reviewReasons: r.reviewReasons, overrideReasons: r.overrideReasons, reasoning: r.reasoning, finalCategory: r.final })} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        {result.tokens.total.toLocaleString()} tokens spent on this model and prompt version ({result.tokens.prompt.toLocaleString()} prompt + {result.tokens.completion.toLocaleString()} completion). Labels: {CATEGORY_LABELS.paid} means a credible claim, not verified payment.
      </p>
    </section>
  );
}
