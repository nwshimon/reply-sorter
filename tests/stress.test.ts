import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { displayedCategory, isCategory, type Category } from "../src/lib/categories";
import { acceptableFor, modelDisplayed, passes, ruleKey, summarizeStress, type StressLabel, type StressRow } from "../src/lib/stress";

const row = (o: Partial<StressRow> & { id: string; label: Category; final: Category }): StressRow => ({
  group: "g", rule: "r", pair: null, split: "dev", body: "b", acceptable: [o.label], model: o.final, error: null, reasoning: null, overrideReasons: [], ...o,
});

describe("grading", () => {
  it("passes when the displayed category is the label", () => expect(passes(row({ id: "a", label: "paid", final: "paid" }))).toBe(true));
  it("fails when it isn't", () => expect(passes(row({ id: "a", label: "paid", final: "needs_human" }))).toBe(false));
  it("passes an acceptable alternative on an ambiguous case, but doesn't count it as exact", () => {
    const r = row({ id: "a", label: "needs_human", final: "promise_to_pay", acceptable: ["needs_human", "promise_to_pay"] });
    expect(passes(r)).toBe(true);
    expect(summarizeStress([r]).exact).toBe(0);
  });
  it("a run that errored is neither a pass nor a fail (a failure isn't an answer)", () => {
    const r = row({ id: "a", label: "needs_human", final: "needs_human", error: "rate_limit: 429" });
    expect(passes(r)).toBe(false);
    const s = summarizeStress([r]);
    expect([s.scored, s.errors, s.passed, s.passRate, s.failures.length]).toEqual([0, 1, 0, null, 0]);
  });
  it("acceptableFor defaults to the label alone", () => {
    expect(acceptableFor({ display_category: "dispute" })).toEqual(["dispute"]);
    expect(acceptableFor({ display_category: "needs_human", acceptable: ["needs_human", "promise_to_pay"] })).toEqual(["needs_human", "promise_to_pay"]);
  });
  it("modelDisplayed maps category + rank through the policy table; an invalid pair or a failure is needs_human", () => {
    expect(modelDisplayed("promise_to_pay", 3)).toBe("dispute");
    expect(modelDisplayed("paid", 0)).toBe("needs_human");
    expect(modelDisplayed(null, null)).toBe("needs_human");
  });
});

describe("summary", () => {
  const rows = [
    row({ id: "1", group: "A", pair: "p1", label: "paid", final: "paid" }),
    row({ id: "2", group: "A", pair: "p1", label: "needs_human", final: "needs_human" }),
    row({ id: "3", group: "B", pair: "p2", label: "promise_to_pay", final: "needs_human" }),
    row({ id: "4", group: "B", pair: "p2", label: "needs_human", final: "needs_human" }),
    row({ id: "5", group: "B", label: "dispute", final: "paid" }),
  ];
  const s = summarizeStress(rows);
  it("counts passes and the pass rate", () => expect([s.scored, s.passed, s.passRate]).toEqual([5, 3, 0.6]));
  it("scores by group", () => expect(s.byGroup).toEqual([{ group: "A", total: 2, passed: 2 }, { group: "B", total: 3, passed: 1 }]));
  it("a minimal pair passes only if BOTH members pass", () => expect(s.pairs).toEqual([{ pair: "p1", ids: ["1", "2"], passed: true }, { pair: "p2", ids: ["3", "4"], passed: false }]));
  it("lists the failures", () => expect(s.failures.map((r) => r.id)).toEqual(["3", "5"]));
  it("scores by the policy rule each case cites (the part before the colon)", () => {
    const r = summarizeStress([
      row({ id: "1", label: "paid", final: "paid", rule: "§3 paid 1 (b): an identifier" }),
      row({ id: "2", label: "needs_human", final: "paid", rule: "§3 paid 1 (b): no identifier" }),
      row({ id: "3", label: "dispute", final: "dispute", rule: "§2.2: precedence" }),
    ]);
    expect(r.byRule).toEqual([{ rule: "§2.2", total: 1, passed: 1, ids: ["3"] }, { rule: "§3 paid 1 (b)", total: 2, passed: 1, ids: ["1", "2"] }]);
    expect(ruleKey("§4.6: promise horizon")).toBe("§4.6");
  });
  it("flags a false paid: shown as paid when paid isn't an acceptable answer", () => expect(s.falsePaid).toEqual(["5"]));
  it("a paid that IS acceptable (e.g. the amount-in-words case) is not a false paid", () => {
    const ok = row({ id: "x", label: "paid", final: "paid", acceptable: ["paid", "needs_human"] });
    expect(summarizeStress([ok]).falsePaid).toEqual([]);
  });
});

describe("the drafted stress files (data/stress-*.json)", () => {
  const labels = JSON.parse(readFileSync("data/stress-labels.json", "utf8")) as StressLabel[];
  const replies = JSON.parse(readFileSync("data/stress-replies.json", "utf8")) as { id: string; body: string; invoice: { amount: number } }[];
  const main = new Set(["data/replies.json", "data/heldout-replies.json"].flatMap((f) => (JSON.parse(readFileSync(f, "utf8")) as { body: string }[]).map((r) => r.body.trim())));

  it("has a reply for every label, with valid category names and a rule cited", () => {
    expect(replies.map((r) => r.id)).toEqual(labels.map((l) => l.id));
    for (const l of labels) {
      expect(isCategory(l.category) && isCategory(l.display_category), l.id).toBe(true);
      expect(l.rule.length, l.id).toBeGreaterThan(5);
      expect(acceptableFor(l), l.id).toContain(l.display_category);
    }
  });
  it("each displayed label follows the policy table, except the deliberate 30-day-horizon cases", () => {
    const horizon = new Set(["S11", "S13"]);
    for (const l of labels) expect(l.display_category, l.id).toBe(horizon.has(l.id) ? "needs_human" : displayedCategory(l.category, l.rank));
  });
  it("shares no reply with the given data (the evaluation must not see its own examples)", () => {
    for (const r of replies) expect(main.has(r.body.trim()), r.id).toBe(false);
  });
  it("keeps each minimal pair inside one split, so tuning on dev can't leak the locked set", () => {
    const splits = new Map<string, Set<string>>();
    for (const l of labels) if (l.pair) splits.set(l.pair, (splits.get(l.pair) ?? new Set()).add(l.split));
    for (const [pair, s] of splits) expect(s.size, pair).toBe(1);
  });
});
