// Evaluation metrics (CLAUDE.md "Evaluation"). Pure functions: no database, no network, no env.
// Used by scripts/eval.ts AND the /eval page, so the two can never disagree.
// Scores against the hand labels only, never against corrections.
import { CATEGORIES, type Category } from "./categories";

/** One reply that has a result, with my label beside it. */
export type EvalRow = {
  id: string;
  body: string;
  /** My label (v0 category from labels.json). */
  label: Category;
  /** What the model alone would have shown: its category + rank mapped to v0, before any code rule. */
  model: Category;
  /** What the app shows: after the code rules. */
  final: Category;
  needsReview: boolean;
  reasoning: string | null;
  overrideReasons: string[];
  reviewReasons: string[];
};

export type CategoryScore = {
  category: Category;
  /** Replies my labels put in this category. */
  support: number;
  /** Replies the system put in this category. */
  predicted: number;
  truePositives: number;
  /** null when nothing was predicted (precision) or nothing was labelled (recall). */
  precision: number | null;
  recall: number | null;
};

export type SystemScore = {
  perCategory: CategoryScore[];
  /** matrix[label][predicted] = number of replies. */
  confusion: Record<Category, Record<Category, number>>;
  accuracy: number | null;
  /** Marked paid, but my label says otherwise. The costliest mistake. */
  falsePaid: { count: number; ids: string[] };
  /** Labelled paid but not marked paid. Safe direction: a person checks it. */
  missedPaid: { count: number; ids: string[] };
};

export type Mismatch = EvalRow;

export type Metrics = {
  coverage: { scored: number; total: number; failed: number; missing: number };
  /** The model's answer alone, before the code rules. */
  model: SystemScore;
  /** What the app shows, after the code rules. */
  final: SystemScore;
  /** Share of scored replies sent to a person. */
  reviewRate: number | null;
  reviewed: number;
  /** Replies the final answer got wrong. */
  wrong: number;
  /** Of those, how many were NOT in the review queue: mistakes nobody would see. */
  wrongNotReviewed: { count: number; ids: string[] };
  /** Replies the code rules changed to a different category, and how many of those became correct / incorrect. */
  rulesChanged: { count: number; fixed: string[]; broke: string[] };
  /** Every reply whose final category differs from my label. */
  mismatches: Mismatch[];
  /** Replies where the raw model answer differed from my label, but the final answer matched (rules caught them). */
  caughtByRules: string[];
};

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

function emptyMatrix(): Record<Category, Record<Category, number>> {
  const m = {} as Record<Category, Record<Category, number>>;
  for (const l of CATEGORIES) {
    m[l] = {} as Record<Category, number>;
    for (const p of CATEGORIES) m[l][p] = 0;
  }
  return m;
}

function scoreSystem(rows: EvalRow[], pick: (r: EvalRow) => Category): SystemScore {
  const confusion = emptyMatrix();
  for (const r of rows) confusion[r.label][pick(r)]++;

  const perCategory = CATEGORIES.map((category): CategoryScore => {
    const truePositives = confusion[category][category];
    const support = CATEGORIES.reduce((n, p) => n + confusion[category][p], 0);
    const predicted = CATEGORIES.reduce((n, l) => n + confusion[l][category], 0);
    return { category, support, predicted, truePositives, precision: ratio(truePositives, predicted), recall: ratio(truePositives, support) };
  });

  const falsePaidIds = rows.filter((r) => pick(r) === "paid" && r.label !== "paid").map((r) => r.id);
  const missedPaidIds = rows.filter((r) => r.label === "paid" && pick(r) !== "paid").map((r) => r.id);
  const correct = rows.filter((r) => pick(r) === r.label).length;
  return {
    perCategory,
    confusion,
    accuracy: ratio(correct, rows.length),
    falsePaid: { count: falsePaidIds.length, ids: falsePaidIds },
    missedPaid: { count: missedPaidIds.length, ids: missedPaidIds },
  };
}

/**
 * @param rows   replies that have a current (successful) result
 * @param total  how many replies the set should have (40, or 12 held-out)
 * @param failed how many replies have only failed attempts
 */
export function computeMetrics(rows: EvalRow[], total: number, failed = 0): Metrics {
  const mismatches = rows.filter((r) => r.final !== r.label);
  const reviewed = rows.filter((r) => r.needsReview).length;
  const wrongNotReviewed = mismatches.filter((r) => !r.needsReview).map((r) => r.id);
  const changed = rows.filter((r) => r.model !== r.final);

  return {
    coverage: { scored: rows.length, total, failed, missing: Math.max(0, total - rows.length - failed) },
    model: scoreSystem(rows, (r) => r.model),
    final: scoreSystem(rows, (r) => r.final),
    reviewRate: ratio(reviewed, rows.length),
    reviewed,
    wrong: mismatches.length,
    wrongNotReviewed: { count: wrongNotReviewed.length, ids: wrongNotReviewed },
    rulesChanged: {
      count: changed.length,
      fixed: changed.filter((r) => r.final === r.label).map((r) => r.id),
      broke: changed.filter((r) => r.model === r.label).map((r) => r.id),
    },
    mismatches,
    caughtByRules: rows.filter((r) => r.model !== r.label && r.final === r.label).map((r) => r.id),
  };
}

export const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
