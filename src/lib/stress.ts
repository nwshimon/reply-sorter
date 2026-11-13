// Grading for the stress-test set (data/stress-*.json). Pure functions: no network, no database, no env.
// The stress set is separate from the 40 given replies: it never touches the database or the app's lists.
import { displayedCategory, type Category } from "./categories";
import type { ModelOutput } from "./classifier/schema";

export type StressLabel = {
  id: string;
  category: Category;
  rank: number;
  display_category: Category;
  /** Every displayed category that is a defensible answer (always includes display_category). Absent = only the label. */
  acceptable?: Category[];
  rule: string;
  group: string;
  pair: string | null;
  split: "dev" | "locked";
  note: string | null;
};

export type StressRow = {
  id: string;
  group: string;
  rule: string;
  pair: string | null;
  split: "dev" | "locked";
  body: string;
  label: Category;
  acceptable: Category[];
  /** What the model alone would have shown (its category + rank mapped through POLICY.md section 5, no rules). */
  model: Category;
  /** What the app would show after the code rules. */
  final: Category;
  /** The run failed (timeout, rate limit, unusable answer). Not scored: a failure is not an answer. */
  error: string | null;
  reasoning: string | null;
  overrideReasons: string[];
  /** The evidence quote the model gave, and whether it is an exact copy of the reply (older result files lack these). */
  quote?: string | null;
  quoteExact?: boolean | null;
  /** The model's validated JSON, untouched by any rule: lets a run be replayed offline with different code rules. */
  raw?: ModelOutput | null;
};

export const acceptableFor = (l: Pick<StressLabel, "display_category" | "acceptable">): Category[] => l.acceptable ?? [l.display_category];

/** Passes when the displayed category is one of the acceptable answers. A run that errored is neither pass nor fail. */
export const passes = (r: Pick<StressRow, "final" | "acceptable" | "error">): boolean => r.error === null && r.acceptable.includes(r.final);
export const modelPasses = (r: Pick<StressRow, "model" | "acceptable" | "error">): boolean => r.error === null && r.acceptable.includes(r.model);

/** The model's own displayed category: category + rank through the policy table; an invalid pair counts as needs_human. */
export function modelDisplayed(category: Category | null, rank: number | null): Category {
  return category !== null && rank !== null ? (displayedCategory(category, rank) ?? "needs_human") : "needs_human";
}

export type GroupScore = { group: string; total: number; passed: number };
/** A policy rule (the part of the cited rule before the colon, e.g. "§3 paid 1 (b)") and how its cases did. */
export type RuleScore = { rule: string; total: number; passed: number; ids: string[] };

/** "§3 paid 1 (b): a specific identifier" → "§3 paid 1 (b)". */
export const ruleKey = (rule: string): string => rule.split(":")[0].trim();
export type PairScore = { pair: string; ids: string[]; passed: boolean };
export type StressSummary = {
  scored: number;
  errors: number;
  passed: number;
  passRate: number | null;
  /** Passed with the label's own answer (not just an acceptable alternative). */
  exact: number;
  /** Model alone, before the code rules. */
  modelPassed: number;
  /** Shown as paid when `paid` is not an acceptable answer: the costliest mistake. */
  falsePaid: string[];
  byGroup: GroupScore[];
  /** Pass rate per cited policy rule: "does the system match expectations policy-wise?" */
  byRule: RuleScore[];
  /** A minimal pair passes only if BOTH members pass: that is what shows the model read the rule, not a surface cue. */
  pairs: PairScore[];
  failures: StressRow[];
};

export function summarizeStress(rows: StressRow[]): StressSummary {
  const scoredRows = rows.filter((r) => r.error === null);
  const passed = scoredRows.filter(passes);

  const groups = new Map<string, GroupScore>();
  for (const r of scoredRows) {
    const g = groups.get(r.group) ?? { group: r.group, total: 0, passed: 0 };
    g.total++;
    if (passes(r)) g.passed++;
    groups.set(r.group, g);
  }

  const rules = new Map<string, RuleScore>();
  for (const r of scoredRows) {
    const k = ruleKey(r.rule);
    const s = rules.get(k) ?? { rule: k, total: 0, passed: 0, ids: [] };
    s.total++;
    if (passes(r)) s.passed++;
    s.ids.push(r.id);
    rules.set(k, s);
  }

  const pairIds = new Map<string, StressRow[]>();
  for (const r of rows) if (r.pair) pairIds.set(r.pair, [...(pairIds.get(r.pair) ?? []), r]);
  const pairs: PairScore[] = [...pairIds.entries()]
    .map(([pair, members]) => ({ pair, ids: members.map((m) => m.id), passed: members.length > 1 && members.every(passes) }))
    .sort((a, b) => a.pair.localeCompare(b.pair));

  return {
    scored: scoredRows.length,
    errors: rows.length - scoredRows.length,
    passed: passed.length,
    passRate: scoredRows.length === 0 ? null : passed.length / scoredRows.length,
    exact: scoredRows.filter((r) => r.final === r.label).length,
    modelPassed: scoredRows.filter(modelPasses).length,
    falsePaid: scoredRows.filter((r) => r.final === "paid" && !r.acceptable.includes("paid")).map((r) => r.id),
    byGroup: [...groups.values()].sort((a, b) => a.group.localeCompare(b.group)),
    byRule: [...rules.values()].sort((a, b) => a.rule.localeCompare(b.rule)),
    pairs,
    failures: scoredRows.filter((r) => !passes(r)),
  };
}

/** What a saved stress run looks like on disk (eval/stress-<prompt>-<model>-<split>.json). */
export type StressRun = {
  kind: "stress";
  split: "dev" | "locked" | "all";
  model: string;
  promptVersion: string;
  generatedAt: string;
  tokens: { prompt: number; completion: number; total: number };
  summary: StressSummary;
  rows: StressRow[];
};
