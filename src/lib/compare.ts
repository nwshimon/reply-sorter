// Compare two runs reply by reply: what got fixed, what regressed, and WHY (did the model's own answer change, or did a
// code rule move the displayed category?). Pure functions: no network, no database, no env.
import type { Category } from "./categories";

export type RunRow = {
  id: string;
  /** Displayed categories that count as correct (just the label for the given data). */
  acceptable: Category[];
  /** What the model alone would display (its category + rank through the policy table, no code rule). */
  model: Category;
  /** The model's own answer in full ("promise_to_pay 2"), when known: catches changes that don't change the display. */
  modelKey?: string;
  /** What the app shows after the code rules. */
  final: Category;
};

export type Change = {
  id: string;
  /** regression: was right, now wrong. fix: was wrong, now right. moved: the display changed, correctness didn't. */
  kind: "regression" | "fix" | "moved";
  /** "model": the model's own answer changed. "code rule": same model answer, a rule changed the display. */
  source: "model" | "code rule";
  before: Category;
  after: Category;
  modelBefore: string;
  modelAfter: string;
};

export type Comparison = {
  compared: number;
  passedBefore: number;
  passedAfter: number;
  changes: Change[];
  regressions: Change[];
  fixes: Change[];
  /** Replies whose own model answer changed but whose display didn't: invisible in accuracy, a warning about instability. */
  hiddenModelChanges: string[];
};

const passes = (r: RunRow) => r.acceptable.includes(r.final);
const key = (r: RunRow) => r.modelKey ?? r.model;

export function diffRuns(before: RunRow[], after: RunRow[]): Comparison {
  const b = new Map(after.map((r) => [r.id, r]));
  const changes: Change[] = [];
  const hidden: string[] = [];
  let compared = 0, passedBefore = 0, passedAfter = 0;

  for (const x of before) {
    const y = b.get(x.id);
    if (!y) continue;
    compared++;
    if (passes(x)) passedBefore++;
    if (passes(y)) passedAfter++;
    const source: Change["source"] = key(x) !== key(y) ? "model" : "code rule";
    if (x.final !== y.final) {
      const kind: Change["kind"] = passes(x) && !passes(y) ? "regression" : !passes(x) && passes(y) ? "fix" : "moved";
      changes.push({ id: x.id, kind, source, before: x.final, after: y.final, modelBefore: key(x), modelAfter: key(y) });
    } else if (key(x) !== key(y)) {
      hidden.push(x.id);
    }
  }
  const sorted = changes.sort((p, q) => p.id.localeCompare(q.id));
  return {
    compared,
    passedBefore,
    passedAfter,
    changes: sorted,
    regressions: sorted.filter((c) => c.kind === "regression"),
    fixes: sorted.filter((c) => c.kind === "fix"),
    hiddenModelChanges: hidden.sort(),
  };
}
