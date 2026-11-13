import { CategoryPill } from "@/components/CategoryPill";
import { RulesApplied } from "@/components/ReplyFacts";
import type { StressFile } from "@/lib/eval-files";
import { pct } from "@/lib/metrics";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-green-700" : ""}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
    </div>
  );
}

function ScoreTable({ title, rows }: { title: string; rows: { key: string; total: number; passed: number }[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full min-w-[300px] text-sm">
        <thead className="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">{title}</th>
            <th className="px-3 py-2 text-right font-medium">Passed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-1.5 text-left">{r.key}</td>
              <td className={`px-3 py-1.5 text-right ${r.passed < r.total ? "font-medium text-red-700" : "text-neutral-600"}`}>
                {r.passed}/{r.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One saved stress run: how the system did against cases written from the policy, by rule, by group and by minimal pair. */
export function StressReport({ run, defaultOpen }: { run: StressFile; defaultOpen?: boolean }) {
  const s = run.summary;
  const screening = run.model.includes("qwen");
  const altOnly = s.passed - s.exact;

  return (
    <details open={defaultOpen} className="group rounded-xl border border-neutral-200 bg-neutral-50/50">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block text-neutral-400 transition group-open:rotate-90">▸</span>
        <span className="font-medium">
          {run.split === "all" ? "Custom selection" : `${run.split === "dev" ? "Dev" : "Locked"} set`} · <span className="font-mono text-sm">{run.model}</span>
        </span>
        <span className="text-sm text-neutral-600">
          {s.passed}/{s.scored} passed ({pct(s.passRate)})
          {s.falsePaid.length > 0 && <strong className="ml-2 text-red-700">· {s.falsePaid.length} false paid</strong>}
        </span>
        {screening && <span className="text-xs text-neutral-500">Screening run on a different model: not part of the reported evaluation</span>}
      </summary>

      <div className="space-y-5 border-t border-neutral-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Passed" value={`${s.passed}/${s.scored}`} sub={altOnly > 0 ? `${altOnly} with an acceptable alternative answer` : "every pass is the labelled answer"} />
          <Stat label="False “paid”" value={String(s.falsePaid.length)} tone={s.falsePaid.length === 0 ? "good" : "bad"} sub={s.falsePaid.length ? s.falsePaid.map((i) => `#${i}`).join(", ") : "none"} />
          <Stat label="Model alone" value={`${s.modelPassed}/${s.scored}`} sub="before the code rules" />
          <Stat label="Minimal pairs" value={`${s.pairs.filter((p) => p.passed).length}/${s.pairs.length}`} sub="both replies in the pair correct" />
        </div>
        <p className="text-xs text-neutral-500">
          prompt {run.promptVersion} · {run.tokens.total.toLocaleString()} tokens{s.errors > 0 ? ` · ${s.errors} case(s) failed to run and are not scored` : ""}
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <ScoreTable title="By policy rule" rows={s.byRule.map((r) => ({ key: r.rule, total: r.total, passed: r.passed }))} />
          <ScoreTable title="By group" rows={s.byGroup.map((g) => ({ key: g.group, total: g.total, passed: g.passed }))} />
        </div>

        {s.pairs.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">Minimal pairs</h4>
            <ul className="flex flex-wrap gap-2 text-xs">
              {s.pairs.map((p) => (
                <li key={p.pair} className={`rounded-md border px-2 py-1 ${p.passed ? "border-neutral-200 text-neutral-600" : "border-red-200 bg-red-50 text-red-800"}`}>
                  {p.passed ? "✓" : "✗"} {p.pair.replace(/^pair-/, "")} <span className="text-neutral-400">({p.ids.join(", ")})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {s.failures.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Failures ({s.failures.length})</h4>
            <ul className="space-y-3">
              {s.failures.map((r) => (
                <li key={r.id} className="space-y-2 rounded-xl border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="font-mono text-xs">{r.id}</span>
                    <span className="text-xs text-neutral-500">{r.group}</span>
                    <span className="text-xs text-neutral-500">expected</span>
                    <CategoryPill category={r.label} />
                    {r.acceptable.length > 1 && <span className="text-xs text-neutral-400">(or {r.acceptable.filter((a) => a !== r.label).map((a) => a.replace("_", " ")).join(", ")})</span>}
                    <span className="text-xs text-neutral-500">system</span>
                    <CategoryPill category={r.final} />
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-neutral-50 p-2.5 text-sm">{r.body}</p>
                  <p className="text-xs text-neutral-500">Policy: {r.rule}</p>
                  {r.reasoning && <p className="text-sm text-neutral-600">{r.reasoning}</p>}
                  <RulesApplied overrides={r.overrideReasons} modelCategory={r.model} final={r.final} />
                  {r.quoteExact === false && r.quote && <p className="text-xs text-amber-800">The model’s evidence quote isn’t an exact copy of the reply: “{r.quote}”</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
