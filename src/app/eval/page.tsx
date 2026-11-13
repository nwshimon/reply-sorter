import Link from "next/link";
import { CategoryPill } from "@/components/CategoryPill";
import { ConfusionMatrix } from "@/components/ConfusionMatrix";
import { RulesApplied } from "@/components/ReplyFacts";
import { StressReport } from "@/components/StressReport";
import { loadEvalFiles, loadStressFiles, newestFirst, type EvalFile } from "@/lib/eval-files";
import { pct } from "@/lib/metrics";

// Reads the committed eval/results-*.json files, so the page shows exactly what is in the repo.
export const dynamic = "force-dynamic";

const ids = (list: string[]) => list.map((i) => `#${i}`).join(", ");
const runLabel = (f: EvalFile) => `${f.promptVersion} · ${f.model}`;

export default async function EvalPage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  const files = loadEvalFiles();
  const datasets = files.filter((f) => f.set === "dataset").sort(newestFirst);

  if (datasets.length === 0) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Evaluation</h1>
        <p className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
          No evaluation results yet. Run <span className="font-mono">npm run eval</span> after a classification run.
        </p>
      </main>
    );
  }

  // Default: the latest prompt version.
  const selected = datasets.find((f) => f.file === run) ?? datasets[0];
  // v0 baseline = the v0 policy's results (prompt v1), compared with the selected run when that is a later version.
  const stressRuns = loadStressFiles().filter((r) => r.promptVersion === selected.promptVersion);
  const baseline = datasets.filter((f) => f.promptVersion === "v1").sort((a, b) => Number(b.model.includes("120b")) - Number(a.model.includes("120b")))[0];

  return (
    <main className="mx-auto w-full max-w-4xl space-y-12 px-4 py-8 sm:px-8">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Evaluation</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Scored against the hand labels in <span className="font-mono">data/labels.json</span>. Corrections made in the app never change these numbers.
          </p>
        </div>
        {datasets.length > 1 && (
          <nav aria-label="Choose a run" className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-neutral-400">Run</span>
            {datasets.map((f) => (
              <Link
                key={f.file}
                href={`/eval?run=${f.file}`}
                aria-current={f.file === selected.file ? "true" : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  f.file === selected.file ? "border-accent bg-tan text-ink" : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {runLabel(f)}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <Section result={selected} title="Dataset (40 replies)" />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Stress tests</h2>
          <p className="text-sm text-neutral-500">
            New cases written from the policy, kept apart from the 40 given replies. Many are minimal pairs: two replies that differ in one policy fact. Prompt {selected.promptVersion}.
          </p>
        </div>
        {stressRuns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-sm text-neutral-500">No stress runs for prompt {selected.promptVersion} yet.</p>
        ) : (
          <div className="space-y-3">
            {stressRuns.map((r, i) => (
              <StressReport key={r.file} run={r} defaultOpen={i === 0} />
            ))}
          </div>
        )}
      </section>

      {baseline && baseline.file !== selected.file && <Comparison before={baseline} after={selected} />}

    </main>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-green-700" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

function Section({ result, title }: { result: EvalFile; title: string }) {
  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <Body result={result} />
    </section>
  );
}

function Body({ result }: { result: EvalFile }) {
  const m = result.metrics;
  const cov = m.coverage;
  const fp = m.final.falsePaid;

  return (
    <div className="space-y-6">
      {cov.scored < cov.total && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Partial run: {cov.scored} of {cov.total} replies have a result</strong>
          {cov.failed > 0 && `, ${cov.failed} failed`}
          {cov.missing > 0 && `, ${cov.missing} not run`}. These numbers cover only those replies.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="False “paid”"
          value={String(fp.count)}
          tone={fp.count === 0 ? "good" : "bad"}
          sub={fp.count === 0 ? "Nothing was shown as paid that my labels say isn’t." : `Shown as paid, but not paid: ${ids(fp.ids)}`}
        />
        <Stat label="Review rate" value={pct(m.reviewRate)} sub={`${m.reviewed} of ${cov.scored} replies in the queue`} />
        <Stat label="Coverage" value={`${cov.scored}/${cov.total}`} sub={cov.failed ? `${cov.failed} failed` : "classified"} />
        <Stat label="Accuracy" value={pct(m.final.accuracy)} sub={`model only ${pct(m.model.accuracy)}`} />
      </div>
      <p className="text-xs text-neutral-500">
        <span className="font-mono">{result.model}</span> · prompt {result.promptVersion} · {result.tokens.total.toLocaleString()} tokens used ({result.tokens.prompt.toLocaleString()} prompt + {result.tokens.completion.toLocaleString()} completion)
      </p>

      <div className="space-y-1 text-sm text-neutral-600">
        <p>
          Wrong answers: <strong>{m.wrong}</strong>
          {m.wrongNotReviewed.count > 0
            ? `. ${m.wrongNotReviewed.count} were handled automatically, so nobody would see them (${ids(m.wrongNotReviewed.ids)}).`
            : m.wrong > 0
              ? ", and each one is waiting in the review queue."
              : "."}
        </p>
        <p>
          Missed paid (my label says paid, shown as something else): <strong>{m.final.missedPaid.count}</strong>
          {m.final.missedPaid.count > 0 && ` (${ids(m.final.missedPaid.ids)})`}. That’s the safe direction: a person checks it.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Precision and recall per category</h3>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left font-medium">Category</th>
                <th rowSpan={2} className="px-3 py-2 text-right font-medium" title="Replies my labels put in this category">Examples</th>
                <th colSpan={2} className="border-l border-neutral-200 px-3 py-1 text-center font-medium">Model only</th>
                <th colSpan={2} className="border-l border-neutral-200 px-3 py-1 text-center font-medium">Final (after rules)</th>
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
                const few = f.support < 5;
                return (
                  <tr key={f.category}>
                    <td className="px-3 py-2">
                      <CategoryPill category={f.category} />
                      {few && <div className="mt-1 text-[11px] leading-tight text-amber-700">Few examples: one miss moves recall a lot.</div>}
                    </td>
                    <td className={`px-3 py-2 text-right ${few ? "text-amber-700" : ""}`}>{f.support}</td>
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
          Precision: of the replies the system put in a category, how many my labels agree with. Recall: of the replies I labelled that way, how many the system found. “n/a” means there was nothing to measure.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Confusion matrix</h3>
        <ConfusionMatrix matrix={m.final.confusion} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Mismatches ({m.mismatches.length})</h3>
        {m.mismatches.length === 0 ? (
          <p className="text-sm text-neutral-500">None: every reply matches my label.</p>
        ) : (
          <ul className="space-y-3">
            {m.mismatches.map((r) => (
              <li key={r.id} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <Link href={`/replies/${r.id}`} className="font-mono text-xs underline underline-offset-2">#{r.id}</Link>
                  <span className="text-xs text-neutral-500">my label</span>
                  <CategoryPill category={r.label} />
                  <span className="text-xs text-neutral-500">system</span>
                  <CategoryPill category={r.final} />
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap rounded-lg bg-neutral-50 p-2.5 text-sm">{r.body}</p>
                {r.reasoning && (
                  <p className="text-sm text-neutral-600">
                    <span className="text-xs uppercase tracking-wide text-neutral-500">Reasoning </span>
                    {r.reasoning}
                  </p>
                )}
                <div>
                  <p className="mb-1 text-xs font-medium text-neutral-500">Rules applied</p>
                  <RulesApplied overrides={r.overrideReasons} modelCategory={r.model} final={r.final} />
                </div>
                <Link href={`/replies/${r.id}`} className="inline-block text-xs font-medium underline underline-offset-2 hover:text-ink">
                  Open details
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Headline numbers for the v0 policy (prompt v1, scored on labels-v0.json) next to the v1 policy (prompt v2, labels.json). */
function Comparison({ before, after }: { before: EvalFile; after: EvalFile }) {
  const rows: [string, (f: EvalFile) => string][] = [
    ["False “paid”", (f) => String(f.metrics.final.falsePaid.count)],
    ["Accuracy", (f) => pct(f.metrics.final.accuracy)],
    ["Review rate", (f) => pct(f.metrics.reviewRate)],
    ["Coverage", (f) => `${f.metrics.coverage.scored}/${f.metrics.coverage.total}`],
    ["Tokens used", (f) => f.tokens.total.toLocaleString()],
  ];
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">v0 → v1</h2>
        <p className="text-sm text-neutral-500">
          Headline numbers for the first policy (v0) and the current one (v1). They are scored against different labels, because the policy changed, so compare the shape and not the exact percentages.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium"> </th>
              <th className="px-3 py-2 text-right font-medium">v0 policy<div className="font-normal normal-case text-neutral-400">{runLabel(before)}</div></th>
              <th className="px-3 py-2 text-right font-medium">v1 policy<div className="font-normal normal-case text-neutral-400">{runLabel(after)}</div></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 tabular-nums">
            {rows.map(([label, get]) => (
              <tr key={label}>
                <td className="px-3 py-2 text-left">{label}</td>
                <td className="px-3 py-2 text-right">{get(before)}</td>
                <td className="px-3 py-2 text-right font-medium">{get(after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
