import { describe, expect, it } from "vitest";
import type { Category } from "../src/lib/categories";
import { computeMetrics, pct, type EvalRow } from "../src/lib/metrics";

const row = (id: string, label: Category, model: Category, final: Category = model, needsReview = false): EvalRow => ({
  id, body: `body ${id}`, label, model, final, needsReview, reasoning: null, overrideReasons: [], reviewReasons: [],
});
const score = (m: ReturnType<typeof computeMetrics>["final"], c: Category) => m.perCategory.find((p) => p.category === c)!;

describe("precision and recall", () => {
  // paid: 3 labelled, 2 found, 1 false paid (a dispute marked paid).
  const rows = [
    row("1", "paid", "paid"),
    row("2", "paid", "paid"),
    row("3", "paid", "needs_human"),
    row("4", "dispute", "paid"),
    row("5", "dispute", "dispute"),
    row("6", "needs_human", "needs_human"),
  ];
  const m = computeMetrics(rows, 6);

  it("computes per-category counts, precision and recall", () => {
    expect(score(m.final, "paid")).toMatchObject({ support: 3, predicted: 3, truePositives: 2, precision: 2 / 3, recall: 2 / 3 });
    expect(score(m.final, "dispute")).toMatchObject({ support: 2, predicted: 1, precision: 1, recall: 0.5 });
    expect(score(m.final, "needs_human")).toMatchObject({ support: 1, predicted: 2, precision: 0.5, recall: 1 });
  });
  it("is null, not 0 or NaN, when a category has no predictions or no examples", () => {
    expect(score(m.final, "resend_invoice")).toMatchObject({ support: 0, predicted: 0, precision: null, recall: null });
    expect(pct(null)).toBe("n/a");
  });
  it("builds the confusion matrix as matrix[label][predicted]", () => {
    expect(m.final.confusion.paid.paid).toBe(2);
    expect(m.final.confusion.paid.needs_human).toBe(1);
    expect(m.final.confusion.dispute.paid).toBe(1);
  });
  it("counts accuracy", () => expect(m.final.accuracy).toBe(4 / 6));
});

describe("the headline: false paid", () => {
  it("counts a reply marked paid that my label says isn't, and lists it", () => {
    const m = computeMetrics([row("1", "paid", "paid"), row("2", "dispute", "paid"), row("3", "needs_human", "paid")], 3);
    expect(m.final.falsePaid).toEqual({ count: 2, ids: ["2", "3"] });
  });
  it("is zero when no non-paid reply is marked paid", () => {
    const m = computeMetrics([row("1", "paid", "paid"), row("2", "dispute", "needs_human")], 2);
    expect(m.final.falsePaid.count).toBe(0);
  });
  it("counts a missed paid separately (the safe direction)", () => {
    const m = computeMetrics([row("1", "paid", "needs_human")], 1);
    expect(m.final.falsePaid.count).toBe(0);
    expect(m.final.missedPaid).toEqual({ count: 1, ids: ["1"] });
  });
});

describe("model alone vs after the code rules", () => {
  // #1: the model said paid wrongly and the rules fixed it. #2: the rules wrongly changed a right answer.
  const rows = [
    row("1", "needs_human", "paid", "needs_human", true),
    row("2", "dispute", "dispute", "needs_human", true),
    row("3", "paid", "paid", "paid"),
  ];
  const m = computeMetrics(rows, 3);
  it("scores both, so the gap shows what the rules caught", () => {
    expect(m.model.falsePaid.count).toBe(1);
    expect(m.final.falsePaid.count).toBe(0);
    expect(m.caughtByRules).toEqual(["1"]);
  });
  it("reports how many rule changes fixed or broke an answer", () => {
    expect(m.rulesChanged).toEqual({ count: 2, fixed: ["1"], broke: ["2"] });
  });
});

describe("review rate and unseen mistakes", () => {
  const rows = [
    row("1", "paid", "paid", "paid", false),
    row("2", "dispute", "needs_human", "needs_human", true), // wrong, but a person will see it
    row("3", "promise_to_pay", "dispute", "dispute", false), // wrong and nobody will see it
    row("4", "out_of_office", "out_of_office", "out_of_office", false),
  ];
  const m = computeMetrics(rows, 4);
  it("review rate is the share sent to a person", () => {
    expect(m.reviewed).toBe(1);
    expect(m.reviewRate).toBe(0.25);
  });
  it("lists the wrong answers that were not in the review queue", () => {
    expect(m.wrong).toBe(2);
    expect(m.wrongNotReviewed).toEqual({ count: 1, ids: ["3"] });
  });
  it("lists every mismatch with its row", () => {
    expect(m.mismatches.map((r) => r.id)).toEqual(["2", "3"]);
  });
});

describe("coverage", () => {
  it("shows a partial run as partial", () => {
    const m = computeMetrics([row("1", "paid", "paid")], 40, 2);
    expect(m.coverage).toEqual({ scored: 1, total: 40, failed: 2, missing: 37 });
  });
  it("handles an empty run", () => {
    const m = computeMetrics([], 40);
    expect(m.reviewRate).toBeNull();
    expect(m.final.accuracy).toBeNull();
    expect(m.coverage.missing).toBe(40);
  });
});
